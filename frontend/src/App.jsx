import { useEffect, useState, useRef } from "react";
import ChatWindow from './ChatWindow'; 
import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

const socket = io(BACKEND_URL);

const POSITIONS = [
  { bottom: "4%", left: "50%", transform: "translateX(-50%)" },
  { bottom: "4%", left: "26%" },
  { bottom: "16%", left: "7%" },
  { top: "20%", left: "4%" },
  { top: "4%", left: "26%" },
  { top: "4%", right: "26%" },
  { top: "20%", right: "4%" },
  { bottom: "16%", right: "7%" },
  { bottom: "4%", right: "26%" }
];

const AVATAR_COLORS = [
  "from-violet-500 to-purple-700",
  "from-sky-500 to-blue-700",
  "from-rose-500 to-pink-700",
  "from-amber-500 to-orange-700",
  "from-emerald-500 to-teal-700",
  "from-fuchsia-500 to-purple-700",
  "from-cyan-500 to-blue-700",
  "from-lime-500 to-green-700",
  "from-indigo-500 to-violet-700",
];

const getCardDisplay = (card) => {
  if (!card) return { rank: "?", suit: "?", color: "text-zinc-900" };
  let rank = "?", suitRaw = "?";
  if (typeof card === 'string') { suitRaw = card.slice(-1); rank = card.slice(0, -1); } 
  else if (typeof card === 'object') { rank = card.rank || card.value || "?"; suitRaw = card.suit || card.type || "?"; }
  const suitMap = { 'h': '♥', 'd': '♦', 'c': '♣', 's': '♠', 'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠' };
  const suitSymbol = suitMap[suitRaw] || suitRaw;
  const color = ['♥', '♦'].includes(suitSymbol) ? "text-red-500" : "text-zinc-900";
  return { rank, suit: suitSymbol, color };
};

const getInitials = (name) => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const PlayingCard = ({ card, size = "md", className = "" }) => {
  const { rank, suit, color } = getCardDisplay(card);
  const sizes = {
    sm: "w-9 h-[52px] text-[11px] rounded-lg",
    md: "w-12 h-[68px] text-sm rounded-xl",
    lg: "w-14 h-20 text-base rounded-2xl",
    xl: "w-16 h-[88px] text-lg rounded-2xl",
  };

  return (
    <div className={`${sizes[size]} bg-white shadow-card flex flex-col items-center justify-center font-semibold relative overflow-hidden ${className}`}>
      <span className={`${color} leading-none`}>{rank}</span>
      <span className={`${color} text-[0.85em] leading-none mt-0.5`}>{suit}</span>
    </div>
  );
};

const CardBack = ({ size = "md", className = "" }) => {
  const sizes = {
    sm: "w-9 h-[52px] rounded-lg",
    md: "w-12 h-[68px] rounded-xl",
    lg: "w-14 h-20 rounded-2xl",
  };
  return (
    <div className={`${sizes[size]} card-back border border-white/10 shadow-card ${className}`} />
  );
};

const SpeechBubble = ({ message, isBottom }) => {
  if (!message) return null;
  const bottomStyle = "top-[calc(100%+8px)]";
  const topStyle = "-top-14";

  return (
    <div className={`absolute left-1/2 -translate-x-1/2 glass-panel px-3 py-1.5 z-50 whitespace-pre-line text-center text-xs font-medium text-white/90 min-w-max ${isBottom ? bottomStyle : topStyle}`}>
      {message}
    </div>
  );
};

const StatPill = ({ label, value, accent }) => (
  <div className="glass-panel px-4 py-2.5 flex flex-col gap-0.5 min-w-[120px]">
    <span className="text-[10px] text-white/40 font-medium uppercase tracking-widest">{label}</span>
    <span className={`text-sm font-semibold ${accent}`}>{value}</span>
  </div>
);

export default function App() {
  const [gameState, setGameState] = useState(null);
  const [mySeat, setMySeat] = useState(null);
  const [inputName, setInputName] = useState("Player" + Math.floor(Math.random()*1000));
  const [betAmount, setBetAmount] = useState(0);
  const [bubbles, setBubbles] = useState({});
  const [timeLeft, setTimeLeft] = useState(30);
  const [messages, setMessages] = useState([]);
  const [rebuyAmount, setRebuyAmount] = useState(1000);
  
  const prevStateRef = useRef(null);

  useEffect(() => {
    socket.on("connect", () => console.log("Connected", socket.id));
    
    socket.on("chatUpdate", (msg) => {
        setMessages(prev => [...prev, msg]);
    });

    socket.on("state", (newState) => {
      setGameState(newState);
      
      if (newState.chatMessages) {
          setMessages(newState.chatMessages);
      }
      
      const prev = prevStateRef.current;
      
      if (prev) {
        setBubbles(currentBubbles => {
            let newBubbles = { ...currentBubbles };
            
            const isNewHand = !prev.handInProgress && newState.handInProgress;
            if (isNewHand) {
                return {}; 
            }

            if (prev.stage !== newState.stage) {
                newBubbles = {};
            }

            if (newState.lastWinDetails && newState.lastWinDetails.length > 0) {
                newBubbles = {}; 
                newState.lastWinDetails.forEach((win) => {
                    const winnerIndex = newState.players.findIndex(p => p.name === win.name);
                    if (winnerIndex !== -1) {
                        newBubbles[winnerIndex] = `Wins $${win.amount}\n${win.desc}`;
                    }
                });
                return newBubbles;
            }
            
            newState.players.forEach((p, i) => {
                const prevP = prev.players[i];
                if (!prevP) return;

                if (prevP.state !== 'FOLDED' && p.state === 'FOLDED') {
                    newBubbles[i] = "Fold";
                }
                else if (!prevP.actedThisRound && p.actedThisRound && p.currentBet === prevP.currentBet) {
                    newBubbles[i] = "Check";
                }
                else if (p.currentBet > prevP.currentBet) {
                    if (isNewHand && newState.stage === 'preflop') {
                        const bb = newState.bigBlind || 10;
                        const sb = newState.smallBlind || 5;
                        if (p.currentBet === sb) newBubbles[i] = `Small Blind $${sb}`;
                        else if (p.currentBet === bb) newBubbles[i] = `Big Blind $${bb}`;
                    } else {
                        const prevTableBet = prev.currentBet || 0;
                        if (p.isAllIn && !prevP.isAllIn) newBubbles[i] = "All In!";
                        else if (p.currentBet > prevTableBet) {
                            if (prevTableBet === 0) newBubbles[i] = `Bets $${p.currentBet}`;
                            else newBubbles[i] = `Raises $${p.currentBet}`;
                        } 
                        else newBubbles[i] = "Call";
                    }
                }
            });

            return newBubbles;
        });
      }

      prevStateRef.current = newState; 
    });

    socket.on("joined", ({ seatIndex }) => setMySeat(seatIndex));
    socket.on("error", (msg) => alert("Error: " + msg));

    socket.on("tableReset", () => {
        setMySeat(null);
        setGameState(null);
        setMessages([]);
        setBubbles({});
    });
    
    return () => {
        socket.off();
        socket.off("chatUpdate");
    };
  }, []);

  useEffect(() => {
    if (gameState && mySeat !== null && gameState.currentPlayer === mySeat) {
      const minRaise = gameState.minRaiseAmount || gameState.bigBlind || 10;
      const currentTableBet = gameState.currentBet || 0;
      setBetAmount(currentTableBet + minRaise);
    }
  }, [gameState?.currentPlayer, mySeat]);

  useEffect(() => {
    if (gameState?.handInProgress && gameState?.currentPlayer !== -1) {
        setTimeLeft(30);
        const timerId = setInterval(() => {
            setTimeLeft((t) => Math.max(0, t - 1));
        }, 1000);
        return () => clearInterval(timerId);
    } else {
        setTimeLeft(0);
    }
  }, [gameState?.currentPlayer, gameState?.handInProgress]);

  const handleJoin = () => socket.emit("join", { name: inputName, stack: 1000 });
  const handleStartHand = () => socket.emit("start-hand");
  const handleAddBot = () => socket.emit("add-bot");

  const handleAction = (action, amount = 0) => {
    if (!gameState || mySeat === null) return;
    socket.emit("action", { name: gameState.players[mySeat].name, action, amount });
  };

  const handleSendMessage = (text) => {
    const tableId = gameState?.id || 'default'; 
    socket.emit("sendChat", { tableId, text });
  };

  if (!gameState) {
    return (
      <div className="h-screen w-screen bg-[#050505] flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-white/20 border-t-accent-gold rounded-full animate-spin" />
        <p className="text-white/50 text-sm font-medium tracking-wide">Connecting to table…</p>
      </div>
    );
  }

  const isMyTurn = gameState.currentPlayer === mySeat;
  const isHandInProgress = gameState.handInProgress;
  
  const myPlayer = gameState.players[mySeat];
  const currentTableBet = gameState.currentBet || 0;
  const myStack = myPlayer ? myPlayer.stack : 0;
  const myCurrentBet = myPlayer ? myPlayer.currentBet : 0;
  const totalPot = gameState.pot.reduce((a,b)=>a+b.total, 0);

  const minRaise = gameState.minRaiseAmount || gameState.bigBlind || 10;
  const minValidTotalBet = currentTableBet + minRaise;
  const maxValidTotalBet = myStack + myCurrentBet; 
  const canRaise = maxValidTotalBet > currentTableBet;
  const sliderMin = Math.min(minValidTotalBet, maxValidTotalBet);
  const sliderMax = maxValidTotalBet;
  const amountToCall = currentTableBet - myCurrentBet;
  const isCallAllIn = amountToCall >= myStack;

  const actingPlayer = gameState.currentPlayer !== -1 ? gameState.players[gameState.currentPlayer] : null;

  return (
    <div className="bg-[#050505] h-screen w-screen relative overflow-hidden text-white font-sans selection:bg-none">
      
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[50vh] table-ring rounded-full" />
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

      {/* Top bar */}
      <header className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight text-white/90">PokerWYN</span>
          {isHandInProgress && (
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30 bg-white/[0.06] px-2.5 py-1 rounded-full">
              {gameState.stage}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isHandInProgress && (
            <button 
              onClick={handleAddBot}
              className="text-xs font-semibold text-white/60 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] px-4 py-2 rounded-full transition-colors"
            >
              + Add Bot
            </button>
          )}
          <button 
            onClick={() => {
              if(window.confirm("Are you sure? This will kick everyone and wipe the table.")) {
                  socket.emit("resetTable");
              }
            }}
            className="text-xs font-semibold text-red-400/80 hover:text-red-400 bg-red-500/10 hover:bg-red-500/15 px-4 py-2 rounded-full transition-colors"
          >
            Reset
          </button>
        </div>
      </header>

      {/* Left stats panel */}
      {isHandInProgress && (
        <div className="fixed bottom-44 left-6 z-[100] flex flex-col-reverse gap-2 items-start pointer-events-none">
            {actingPlayer && (
                <StatPill 
                  label="Action on" 
                  value={
                    <span className="flex items-center gap-2">
                      {actingPlayer.name}
                      <span className="text-white/30 font-normal">{timeLeft}s</span>
                    </span>
                  }
                  accent="text-accent-gold"
                />
            )}

            {myPlayer && myPlayer.handDescription && (
                <StatPill label="Your hand" value={myPlayer.handDescription} accent="text-accent-emerald" />
            )}

            {myPlayer && (typeof myPlayer.equity === 'number') && (
                <div className="glass-panel px-4 py-2.5 flex flex-col gap-1.5 min-w-[120px]">
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-[10px] text-white/40 font-medium uppercase tracking-widest">Equity</span>
                        <span className={`text-sm font-semibold ${myPlayer.equity >= myPlayer.potOdds ? 'text-accent-emerald' : 'text-red-400'}`}>
                            {myPlayer.equity}%
                        </span>
                    </div>
                    {myPlayer.potOdds > 0 && (
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-[10px] text-white/40 font-medium uppercase tracking-widest">Pot odds</span>
                            <span className="text-sm font-semibold text-accent-gold">{myPlayer.potOdds}%</span>
                        </div>
                    )}
                </div>
            )}
        </div>
      )}

      {/* Chat */}
      <div className="fixed bottom-40 right-6 z-[100] flex flex-col items-end pointer-events-none">
          <ChatWindow 
            messages={messages} 
            onSendMessage={handleSendMessage}
            currentPlayer={myPlayer}
          />
      </div>

      {/* Table area */}
      <div className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[1000px] aspect-[2.2/1] relative">
        
        {/* Subtle table outline */}
        <div className="absolute inset-0 rounded-[50%] border border-white/[0.06] bg-white/[0.02]" />

        {/* Community cards + pot */}
        <div className="absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-5">
          {!isHandInProgress && (
            <p className="text-white/[0.08] text-3xl font-bold tracking-[0.3em] uppercase pointer-events-none select-none">
              PokerWYN
            </p>
          )}
          
          <div className="flex gap-2 items-center min-h-[80px]">
            {gameState.communityCards.length > 0 ? (
              gameState.communityCards.map((card, i) => (
                <PlayingCard key={i} card={card} size="lg" />
              ))
            ) : isHandInProgress ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-14 h-20 rounded-2xl border border-dashed border-white/[0.08]" />
              ))
            ) : null}
          </div>

          {(totalPot > 0 || isHandInProgress) && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/30 uppercase tracking-widest font-medium">Pot</span>
              <span className="text-accent-gold font-semibold text-lg tabular-nums">${totalPot}</span>
            </div>
          )}
        </div>

        {/* Players */}
        {gameState.players.map((player, serverIndex) => {
          if (player.state === "LEFT") return null;
          const offset = mySeat !== null ? mySeat : 0;
          const displayIndex = (serverIndex - offset + POSITIONS.length) % POSITIONS.length;
          const isActing = gameState.currentPlayer === serverIndex;
          const isBottom = [0, 1, 2, 7, 8].includes(displayIndex);
          const isHero = displayIndex === 0;
          const showCards = (player.hand && player.hand.length > 0 && (mySeat === serverIndex || player.showCards));
          const avatarColor = AVATAR_COLORS[serverIndex % AVATAR_COLORS.length];

          return (
            <div key={serverIndex} className="absolute flex flex-col items-center w-28 transition-all duration-300" style={POSITIONS[displayIndex]}>
              <SpeechBubble message={bubbles[serverIndex]} isBottom={isBottom} />
              
              {player.isBot && (
                <button
                    onClick={(e) => {
                    e.stopPropagation();
                    socket.emit('toggleBotKick', player.seatIndex);
                    }}
                    className={`absolute -top-2 -right-2 w-7 h-7 flex items-center justify-center rounded-full transition-all z-20 ${
                    player.kickPending 
                        ? "bg-white/10 text-white/50 hover:bg-white/15" 
                        : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    }`}
                    title={player.kickPending ? "Cancel Kick" : "Kick Bot after hand"}
                >
                    {player.kickPending ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    )}
                </button>
              )}

              {player.kickPending && (
                <div className="absolute -top-1 w-full text-center z-30 pointer-events-none">
                    <span className="text-[9px] text-red-400/80 font-semibold uppercase tracking-wider">
                      Leaving
                    </span>
                </div>
              )}

              {/* Bet chip */}
              {player.currentBet > 0 && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-30">
                  <span className="bg-accent-gold/20 text-accent-gold text-[10px] font-semibold px-2 py-0.5 rounded-full tabular-nums">
                    ${player.currentBet}
                  </span>
                </div>
              )}
              
              {/* Avatar */}
              <div className={`relative z-10 transition-all duration-300 ${isActing ? 'scale-110' : ''} ${player.state === 'FOLDED' ? 'opacity-40 grayscale' : ''}`}>
                <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${avatarColor} flex items-center justify-center text-sm font-bold text-white shadow-lg ${isActing ? 'ring-2 ring-accent-gold ring-offset-2 ring-offset-[#050505] shadow-glow' : ''}`}>
                  {getInitials(player.name)}
                </div>
                {gameState.buttonIndex === serverIndex && (
                  <div className="absolute -right-1 -bottom-0.5 w-5 h-5 bg-white text-black text-[9px] rounded-full flex items-center justify-center font-bold shadow-md">
                    D
                  </div>
                )}
              </div>

              {/* Name + stack */}
              <div className="mt-1.5 text-center z-20">
                <p className="text-[11px] text-white/50 font-medium truncate max-w-[90px]">{player.name}</p>
                <p className="text-sm font-semibold text-white/90 tabular-nums">${player.stack}</p>
              </div>

              {/* Hole cards */}
              <div className={`flex z-0 mt-1 ${isHero ? '' : ''}`}>
                {showCards ? 
                  player.hand.map((c, i) => (
                    <PlayingCard 
                      key={i} 
                      card={c} 
                      size={isHero ? "md" : "sm"} 
                      className={i > 0 ? "-ml-4" : ""} 
                    />
                  )) : 
                  player.hand && player.hand.length > 0 && (
                    <>
                      <CardBack size={isHero ? "md" : "sm"} />
                      <CardBack size={isHero ? "md" : "sm"} className="-ml-4" />
                    </>
                  )
                }
              </div>

              {player.state === 'FOLDED' && (
                <span className="text-[10px] text-white/30 font-semibold uppercase tracking-wider mt-1">Fold</span>
              )}
              {player.isAllIn && (
                <span className="text-[10px] text-red-400 font-semibold uppercase tracking-wider mt-1">All in</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-0 w-full px-6 pb-8 pt-16 flex justify-center items-end pointer-events-none bg-gradient-to-t from-[#050505] via-[#050505]/90 to-transparent">
        <div className="pointer-events-auto flex flex-col items-center gap-3">
          {mySeat === null ? (
            <div className="flex gap-3 glass-panel p-2 pl-4">
              <input 
                className="bg-transparent text-white placeholder-white/30 font-medium outline-none w-40 text-sm" 
                value={inputName} 
                onChange={e => setInputName(e.target.value)} 
                placeholder="Your name" 
              />
              <button onClick={handleJoin} className="btn-pill-primary">Join Table</button>
            </div>
          ) : (
            <>
              {!isHandInProgress && myPlayer && myPlayer.stack === 0 && (
                <div className="flex flex-col items-center gap-3 glass-panel p-4 w-64">
                    <p className="text-accent-gold text-xs font-semibold uppercase tracking-widest">Busted — rebuy?</p>
                    <div className="flex items-center gap-3 w-full">
                        <span className="text-[10px] text-white/30 tabular-nums">$1</span>
                        <input 
                            type="range" 
                            min="1" 
                            max="1000" 
                            value={rebuyAmount} 
                            onChange={(e) => setRebuyAmount(Number(e.target.value))} 
                            className="flex-1"
                        />
                        <span className="text-[10px] text-white/30 tabular-nums">$1k</span>
                    </div>
                    <button 
                        onClick={() => socket.emit("rebuy", { amount: rebuyAmount })} 
                        className="btn-pill-primary w-full text-center"
                    >
                        Add ${rebuyAmount}
                    </button>
                </div>
              )}

              {!isHandInProgress && myPlayer && myPlayer.hand && myPlayer.hand.length > 0 && !myPlayer.showCards && (
                <button 
                  onClick={() => socket.emit("showHand")} 
                  className="btn-pill text-white/70"
                >
                  Show Cards
                </button>
              )}

              {!isHandInProgress && gameState.players.filter(p => p.state !== 'LEFT').length >= 2 && (
                <button onClick={handleStartHand} className="btn-pill-primary text-base px-10 py-4">
                  Deal Hand
                </button>
              )}

              {isHandInProgress && isMyTurn && (
                <div className="flex flex-col items-center gap-3">
                  {canRaise && (
                    <div className="flex items-center gap-4 glass-panel px-4 py-2">
                      <span className="text-[10px] text-white/30 tabular-nums">${sliderMin}</span>
                      <input 
                        type="range" 
                        min={sliderMin} 
                        max={sliderMax} 
                        value={betAmount} 
                        onChange={(e) => setBetAmount(Number(e.target.value))} 
                        className="w-40" 
                      />
                      <span className="text-[10px] text-white/30 tabular-nums">${sliderMax}</span>
                      <span className="text-sm font-semibold text-accent-gold tabular-nums ml-1">${betAmount}</span>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => handleAction("FOLD")} className="btn-pill-danger">
                      Fold
                    </button>
                    
                    <button 
                      onClick={() => handleAction(amountToCall > 0 ? "CALL" : "CHECK")} 
                      className="btn-pill"
                    >
                      {amountToCall > 0 ? (isCallAllIn ? "Call All-In" : `Call ${amountToCall}`) : "Check"}
                    </button>

                    {canRaise && (
                      <button 
                        onClick={() => {
                          if (betAmount >= maxValidTotalBet) {
                              handleAction("ALL_IN");
                          } else {
                              handleAction("BET", betAmount);
                          }
                        }} 
                        className="btn-pill-primary"
                      >
                        {betAmount >= maxValidTotalBet ? "All In" : `Raise ${betAmount}`}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
