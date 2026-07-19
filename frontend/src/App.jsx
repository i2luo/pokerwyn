import { useEffect, useState, useRef } from "react";
import ChatWindow from './ChatWindow'; 
import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

const socket = io(BACKEND_URL);

// Key under which the backend-issued session token (JWT) is persisted so the
// player can be recognised again after a page reload.
const SESSION_TOKEN_KEY = "pokerwyn.sessionToken";

// Polar layout keeps every seat near the felt rim while staying inside the ellipse.
const TABLE_RX = 40.5; // horizontal radius (% from center)
const TABLE_RY = 35.5; // vertical radius (% from center)

// Bottom-center hero, then evenly spaced (360/9 = 40°) around the table.
const SEAT_ANGLES = [90, 120, 170, 220, 245, 295, 320, 10, 60];

const TOP_SEATS = new Set([3, 4, 5, 6]);
const SIDE_LEFT_SEATS = new Set([2, 3]);
const SIDE_RIGHT_SEATS = new Set([6, 7]);

const toRad = (deg) => (deg * Math.PI) / 180;

const getSeatCoords = (index) => {
  const rad = toRad(SEAT_ANGLES[index]);
  return {
    left: 50 + TABLE_RX * Math.cos(rad),
    top: 50 + TABLE_RY * Math.sin(rad),
  };
};

const getSeatStyle = (index) => {
  const { left, top } = getSeatCoords(index);

  // Anchor each seat so outward content (stack/name) hugs the rail.
  let transform = "translate(-50%, -50%)";
  if (TOP_SEATS.has(index)) {
    transform = "translate(-50%, -30%)";
  } else if (index === 0) {
    transform = "translate(-50%, -68%)";
  } else if (SIDE_LEFT_SEATS.has(index)) {
    transform = "translate(-35%, -50%)";
  } else if (SIDE_RIGHT_SEATS.has(index)) {
    transform = "translate(-65%, -50%)";
  } else {
    transform = "translate(-50%, -68%)";
  }

  return { left: `${left}%`, top: `${top}%`, transform };
};

const getBetStyle = (index) => {
  const { left, top } = getSeatCoords(index);
  const blend = 0.52;

  return {
    left: `${50 + (left - 50) * blend}%`,
    top: `${50 + (top - 50) * blend}%`,
    transform: "translate(-50%, -50%)",
  };
};

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

// Selectable background themes (solid colors, gradients and patterns).
const BACKGROUND_KEY = "pokerwyn.background";

const BACKGROUNDS = [
  { id: "midnight", name: "Midnight", style: { background: "#050505" } },
  {
    id: "ocean",
    name: "Deep Ocean",
    style: { background: "radial-gradient(ellipse at 50% 0%, #0b1f33 0%, #050a12 60%)" },
  },
  {
    id: "purple",
    name: "Royal Purple",
    style: { background: "radial-gradient(ellipse at 50% 0%, #1d0f33 0%, #0a0512 60%)" },
  },
  {
    id: "crimson",
    name: "Crimson",
    style: { background: "radial-gradient(ellipse at 50% 0%, #2a0d12 0%, #0f0506 60%)" },
  },
  {
    id: "forest",
    name: "Forest",
    style: { background: "radial-gradient(ellipse at 50% 0%, #0c241a 0%, #050a08 60%)" },
  },
  {
    id: "grid",
    name: "Carbon Grid",
    style: {
      backgroundColor: "#0a0a0f",
      backgroundImage:
        "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
      backgroundSize: "40px 40px",
    },
  },
  {
    id: "dots",
    name: "Dot Matrix",
    style: {
      backgroundColor: "#0a0a12",
      backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
      backgroundSize: "22px 22px",
    },
  },
  {
    id: "diagonal",
    name: "Diagonal",
    style: {
      backgroundColor: "#0d0a0a",
      backgroundImage:
        "repeating-linear-gradient(45deg, rgba(255,255,255,0.035) 0, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 13px)",
    },
  },
];

const CARD_BACK_KEY = "pokerwyn.cardBack";

const CARD_BACKS = [
  {
    id: "classic",
    name: "Classic",
    style: {
      backgroundColor: "#1a1f2e",
      backgroundImage:
        "repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(255,255,255,0.04) 6px, rgba(255,255,255,0.04) 12px)",
    },
  },
  {
    id: "crimson",
    name: "Crimson",
    style: {
      backgroundColor: "#3a1520",
      backgroundImage:
        "repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 8px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.06) 0, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 8px)",
    },
  },
  {
    id: "royal",
    name: "Royal Blue",
    style: {
      backgroundColor: "#152040",
      backgroundImage:
        "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.08) 1px, transparent 1px)",
      backgroundSize: "10px 10px",
    },
  },
  {
    id: "gold",
    name: "Gold",
    style: {
      backgroundColor: "#2a2210",
      backgroundImage:
        "repeating-linear-gradient(90deg, rgba(212,175,55,0.15) 0, rgba(212,175,55,0.15) 2px, transparent 2px, transparent 10px)",
    },
  },
  {
    id: "emerald",
    name: "Emerald",
    style: {
      backgroundColor: "#0f2a1e",
      backgroundImage:
        "repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 6px), repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 6px)",
    },
  },
  {
    id: "amethyst",
    name: "Amethyst",
    style: {
      backgroundColor: "#251535",
      backgroundImage:
        "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.1) 1px, transparent 1px), radial-gradient(circle at 70% 70%, rgba(255,255,255,0.06) 1px, transparent 1px)",
      backgroundSize: "14px 14px",
    },
  },
  {
    id: "carbon",
    name: "Carbon",
    style: {
      backgroundColor: "#141414",
      backgroundImage:
        "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
      backgroundSize: "8px 8px",
    },
  },
  {
    id: "vegas",
    name: "Vegas",
    style: {
      backgroundColor: "#0a0a0a",
      backgroundImage:
        "repeating-linear-gradient(-45deg, rgba(212,175,55,0.2) 0, rgba(212,175,55,0.2) 3px, transparent 3px, transparent 12px)",
    },
  },
];

const TABLE_COLOR_KEY = "pokerwyn.tableColor";
const TABLE_DESIGN_KEY = "pokerwyn.tableDesign";

const TABLE_COLORS = [
  {
    id: "emerald",
    name: "Emerald",
    preview: "#1d6349",
    feltBackground: "radial-gradient(ellipse at 50% 45%, #247a5c 0%, #1d6349 45%, #164f3a 100%)",
    ring: "rgba(31, 107, 82, 0.25)",
  },
  {
    id: "blue",
    name: "Royal Blue",
    preview: "#1e4470",
    feltBackground: "radial-gradient(ellipse at 50% 45%, #2a5a8a 0%, #1e4470 45%, #153358 100%)",
    ring: "rgba(42, 90, 138, 0.25)",
  },
  {
    id: "burgundy",
    name: "Burgundy",
    preview: "#5c1a2a",
    feltBackground: "radial-gradient(ellipse at 50% 45%, #8a2a3d 0%, #5c1a2a 45%, #451420 100%)",
    ring: "rgba(138, 42, 61, 0.25)",
  },
  {
    id: "charcoal",
    name: "Charcoal",
    preview: "#2a2d32",
    feltBackground: "radial-gradient(ellipse at 50% 45%, #3d4249 0%, #2a2d32 45%, #1e2126 100%)",
    ring: "rgba(61, 66, 73, 0.25)",
  },
  {
    id: "gold",
    name: "Gold Felt",
    preview: "#4a3d1a",
    feltBackground: "radial-gradient(ellipse at 50% 45%, #6b5a2a 0%, #4a3d1a 45%, #352d14 100%)",
    ring: "rgba(107, 90, 42, 0.25)",
  },
  {
    id: "purple",
    name: "Purple",
    preview: "#3d1a5c",
    feltBackground: "radial-gradient(ellipse at 50% 45%, #5a2a8a 0%, #3d1a5c 45%, #2d1445 100%)",
    ring: "rgba(90, 42, 138, 0.25)",
  },
];

const TABLE_DESIGNS = [
  {
    id: "classic",
    name: "Classic",
    preview: { background: "#1d6349", border: "2px solid rgba(74,222,128,0.5)" },
    felt: {
      border: "3px solid rgba(74, 222, 128, 0.45)",
      boxShadow:
        "inset 0 2px 40px rgba(255,255,255,0.06), inset 0 -8px 60px rgba(0,0,0,0.35), 0 0 0 5px rgba(21,94,70,0.7), 0 0 0 9px rgba(255,255,255,0.06)",
    },
    rail: { border: "1px solid rgba(255,255,255,0.1)" },
  },
  {
    id: "minimal",
    name: "Minimal",
    preview: { background: "#1d6349", border: "1px solid rgba(255,255,255,0.25)" },
    felt: {
      border: "2px solid rgba(255,255,255,0.15)",
      boxShadow: "inset 0 4px 30px rgba(0,0,0,0.25)",
    },
    rail: { border: "1px solid rgba(255,255,255,0.05)" },
  },
  {
    id: "vegas",
    name: "Vegas",
    preview: { background: "#1d6349", border: "2px solid rgba(212,175,55,0.7)" },
    felt: {
      border: "4px solid rgba(212,175,55,0.55)",
      boxShadow:
        "inset 0 2px 30px rgba(255,215,0,0.08), inset 0 -6px 50px rgba(0,0,0,0.4), 0 0 0 4px rgba(139,109,20,0.6), 0 0 0 8px rgba(212,175,55,0.15)",
    },
    rail: { border: "1px solid rgba(212,175,55,0.25)" },
  },
  {
    id: "diamond",
    name: "Diamond",
    preview: {
      background:
        "repeating-linear-gradient(45deg, #1d6349, #1d6349 3px, #1a5c44 3px, #1a5c44 6px)",
      border: "1px solid rgba(255,255,255,0.2)",
    },
    felt: {
      border: "3px solid rgba(255,255,255,0.2)",
      boxShadow:
        "inset 0 2px 40px rgba(255,255,255,0.04), inset 0 -8px 60px rgba(0,0,0,0.35), 0 0 0 5px rgba(0,0,0,0.4)",
      backgroundImage:
        "repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,0.03) 8px, rgba(255,255,255,0.03) 9px), repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(255,255,255,0.03) 8px, rgba(255,255,255,0.03) 9px)",
    },
    rail: { border: "1px dashed rgba(255,255,255,0.12)" },
  },
];

const buildFeltStyle = (color, design) => {
  const style = {
    border: design.felt.border,
    boxShadow: design.felt.boxShadow,
  };

  if (design.felt.backgroundImage) {
    style.backgroundImage = `${design.felt.backgroundImage}, ${color.feltBackground}`;
    style.background = "transparent";
  } else {
    style.background = color.feltBackground;
  }

  return style;
};

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
    sm: "w-11 h-[64px] text-[13px] rounded-lg",
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

const CardBack = ({ size = "md", className = "", style }) => {
  const sizes = {
    sm: "w-11 h-[64px] rounded-lg",
    md: "w-12 h-[68px] rounded-xl",
    lg: "w-14 h-20 rounded-2xl",
  };
  return (
    <div className={`${sizes[size]} border border-white/10 shadow-card ${className}`} style={style} />
  );
};

const SpeechBubble = ({ message, isTop }) => {
  if (!message) return null;
  // Top players' bubbles appear above them, bottom players' bubbles appear below them.
  const positionClasses = isTop ? "bottom-[calc(100%+4px)]" : "top-[calc(100%+4px)]";

  return (
    <div className={`absolute left-1/2 -translate-x-1/2 bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-lg px-2.5 py-1 z-50 whitespace-pre-line text-center text-[10px] font-medium text-white/90 min-w-max max-w-[88px] ${positionClasses}`}>
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
  const [bgIndex, setBgIndex] = useState(() => {
    const saved = localStorage.getItem(BACKGROUND_KEY);
    const idx = BACKGROUNDS.findIndex((b) => b.id === saved);
    return idx === -1 ? 0 : idx;
  });
  const [tableColorIndex, setTableColorIndex] = useState(() => {
    const saved = localStorage.getItem(TABLE_COLOR_KEY);
    const idx = TABLE_COLORS.findIndex((c) => c.id === saved);
    return idx === -1 ? 0 : idx;
  });
  const [tableDesignIndex, setTableDesignIndex] = useState(() => {
    const saved = localStorage.getItem(TABLE_DESIGN_KEY);
    const idx = TABLE_DESIGNS.findIndex((d) => d.id === saved);
    return idx === -1 ? 0 : idx;
  });
  const [cardBackIndex, setCardBackIndex] = useState(() => {
    const saved = localStorage.getItem(CARD_BACK_KEY);
    const idx = CARD_BACKS.findIndex((b) => b.id === saved);
    return idx === -1 ? 0 : idx;
  });
  const [showBgPicker, setShowBgPicker] = useState(false);

  const currentBg = BACKGROUNDS[bgIndex] || BACKGROUNDS[0];
  const currentTableColor = TABLE_COLORS[tableColorIndex] || TABLE_COLORS[0];
  const currentTableDesign = TABLE_DESIGNS[tableDesignIndex] || TABLE_DESIGNS[0];
  const currentCardBack = CARD_BACKS[cardBackIndex] || CARD_BACKS[0];
  const feltStyle = buildFeltStyle(currentTableColor, currentTableDesign);

  const prevStateRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(BACKGROUND_KEY, currentBg.id);
  }, [currentBg.id]);

  useEffect(() => {
    localStorage.setItem(TABLE_COLOR_KEY, currentTableColor.id);
  }, [currentTableColor.id]);

  useEffect(() => {
    localStorage.setItem(TABLE_DESIGN_KEY, currentTableDesign.id);
  }, [currentTableDesign.id]);

  useEffect(() => {
    localStorage.setItem(CARD_BACK_KEY, currentCardBack.id);
  }, [currentCardBack.id]);

  useEffect(() => {
    // On a (re)connection, try to resume an existing session before the user
    // is asked to join as a brand-new player.
    const attemptResume = () => {
      const sessionToken = localStorage.getItem(SESSION_TOKEN_KEY);
      if (sessionToken) {
        socket.emit("resume", { sessionToken });
      }
    };

    socket.on("connect", () => {
      console.log("Connected", socket.id);
      attemptResume();
    });

    // If the socket connected before this effect ran, the "connect" event has
    // already fired, so kick off the resume check right away.
    if (socket.connected) attemptResume();

    socket.on("resumeFailed", () => {
      localStorage.removeItem(SESSION_TOKEN_KEY);
    });
    
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

    socket.on("joined", ({ seatIndex, sessionToken }) => {
        if (sessionToken) localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
        setMySeat(seatIndex);
    });
    socket.on("error", (msg) => alert("Error: " + msg));

    socket.on("tableReset", () => {
        localStorage.removeItem(SESSION_TOKEN_KEY);
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
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-4" style={currentBg.style}>
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
    <div className="h-screen w-screen relative overflow-hidden text-white font-sans selection:bg-none" style={currentBg.style}>
      
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[50vh] rounded-full"
          style={{ background: `radial-gradient(ellipse at center, ${currentTableColor.ring} 0%, transparent 70%)` }}
        />
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
          <div className="relative">
            <button
              onClick={() => setShowBgPicker((v) => !v)}
              title="Appearance settings"
              className="flex items-center justify-center w-8 h-8 text-white/60 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] rounded-full transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            {showBgPicker && (
              <div className="absolute right-0 mt-2 z-[200] glass-panel p-3 w-56 max-h-[70vh] overflow-y-auto scrollbar-thin">
                <p className="text-[10px] text-white/40 font-medium uppercase tracking-widest mb-2 px-0.5">Background</p>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {BACKGROUNDS.map((bg, i) => (
                    <button
                      key={bg.id}
                      onClick={() => setBgIndex(i)}
                      title={bg.name}
                      style={bg.style}
                      className={`h-10 w-full rounded-lg border transition-all ${
                        i === bgIndex
                          ? "border-accent-gold ring-1 ring-accent-gold"
                          : "border-white/15 hover:border-white/35"
                      }`}
                    />
                  ))}
                </div>

                <p className="text-[10px] text-white/40 font-medium uppercase tracking-widest mb-2 px-0.5">Table Color</p>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {TABLE_COLORS.map((color, i) => (
                    <button
                      key={color.id}
                      onClick={() => setTableColorIndex(i)}
                      title={color.name}
                      style={{ background: color.preview }}
                      className={`h-10 w-full rounded-lg border transition-all ${
                        i === tableColorIndex
                          ? "border-accent-gold ring-1 ring-accent-gold"
                          : "border-white/15 hover:border-white/35"
                      }`}
                    />
                  ))}
                </div>

                <p className="text-[10px] text-white/40 font-medium uppercase tracking-widest mb-2 px-0.5">Table Design</p>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {TABLE_DESIGNS.map((design, i) => (
                    <button
                      key={design.id}
                      onClick={() => setTableDesignIndex(i)}
                      title={design.name}
                      style={design.preview}
                      className={`h-10 w-full rounded-lg transition-all ${
                        i === tableDesignIndex
                          ? "border-2 border-accent-gold ring-1 ring-accent-gold"
                          : "border border-white/15 hover:border-white/35"
                      }`}
                    />
                  ))}
                </div>

                <p className="text-[10px] text-white/40 font-medium uppercase tracking-widest mb-2 px-0.5">Card Back</p>
                <div className="grid grid-cols-4 gap-2">
                  {CARD_BACKS.map((back, i) => (
                    <button
                      key={back.id}
                      onClick={() => setCardBackIndex(i)}
                      title={back.name}
                      style={back.style}
                      className={`h-10 w-full rounded-lg border transition-all ${
                        i === cardBackIndex
                          ? "border-accent-gold ring-1 ring-accent-gold"
                          : "border-white/15 hover:border-white/35"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
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
                <div className="glass-panel px-4 py-2.5 flex flex-col gap-1.5 min-w-[120px]">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-white/40 font-medium uppercase tracking-widest">Action on</span>
                        <span className="text-[10px] text-white/30 font-medium tabular-nums">{timeLeft}s</span>
                    </div>
                    <span className="text-sm font-semibold text-accent-gold">{actingPlayer.name}</span>
                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-accent-gold rounded-full transition-all duration-1000 ease-linear"
                            style={{ width: `${(timeLeft / 30) * 100}%` }}
                        />
                    </div>
                </div>
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
      <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[94vw] max-w-[980px] aspect-[2.15/1] relative">

        {/* Felt surface */}
        <div className="table-felt absolute inset-0 rounded-[50%]" style={feltStyle} />
        <div className="absolute inset-3 rounded-[50%] table-felt-rail pointer-events-none" style={currentTableDesign.rail} />

        {/* Community cards + pot */}
        <div className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 z-10">
          {!isHandInProgress && (
            <p className="text-emerald-950/30 text-2xl font-bold tracking-[0.25em] uppercase pointer-events-none select-none">
              PokerWYN
            </p>
          )}

          <div className="flex gap-1.5 items-center min-h-[64px]">
            {gameState.communityCards.length > 0 ? (
              gameState.communityCards.map((card, i) => (
                <PlayingCard key={i} card={card} size="sm" />
              ))
            ) : isHandInProgress ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-11 h-[64px] rounded-lg border border-dashed border-emerald-950/20 bg-emerald-950/10" />
              ))
            ) : null}
          </div>

          {(totalPot > 0 || isHandInProgress) && (
            <div className="flex items-center gap-2 bg-black/25 border border-white/10 rounded-full px-3 py-1">
              <span className="text-[10px] text-white/50 uppercase tracking-widest font-medium">Pot</span>
              <span className="text-accent-gold font-semibold text-base tabular-nums">${totalPot}</span>
            </div>
          )}
        </div>

        {/* Players */}
        {gameState.players.map((player, serverIndex) => {
          if (player.state === "LEFT") return null;
          const offset = mySeat !== null ? mySeat : 0;
          const displayIndex = (serverIndex - offset + SEAT_ANGLES.length) % SEAT_ANGLES.length;
          const isActing = gameState.currentPlayer === serverIndex;
          const isTop = TOP_SEATS.has(displayIndex);
          const isMe = mySeat === serverIndex;
          const isFolded = player.state === 'FOLDED';
          const hasHand = player.hand && player.hand.length > 0;
          const showCards = (hasHand && (isMe || player.showCards));
          const avatarColor = AVATAR_COLORS[serverIndex % AVATAR_COLORS.length];

          // Folded hands vanish from everyone else's view; the owner still sees
          // their own cards, greyed out.
          const holeCards = !hasHand ? null
            : isFolded ? (
              isMe ? (
                player.hand.map((c, i) => (
                  <PlayingCard
                    key={i}
                    card={c}
                    size="sm"
                    className={`opacity-40 grayscale ${i > 0 ? "-ml-4" : ""}`}
                  />
                ))
              ) : null
            ) : showCards ? (
              player.hand.map((c, i) => (
                <PlayingCard
                  key={i}
                  card={c}
                  size="sm"
                  className={i > 0 ? "-ml-4" : ""}
                />
              ))
            ) : (
              <>
                <CardBack size="sm" style={currentCardBack.style} />
                <CardBack size="sm" className="-ml-4" style={currentCardBack.style} />
              </>
            );

          return (
            <div
              key={serverIndex}
              className="absolute flex flex-col items-center w-[80px] z-10 transition-all duration-300"
              style={getSeatStyle(displayIndex)}
            >
              <SpeechBubble message={bubbles[serverIndex]} isTop={isTop} />

              {/* Bottom / side seats: hole cards face inward (toward center) */}
              {!isTop && holeCards && (
                <div className="flex mb-0.5 shrink-0">{holeCards}</div>
              )}

              <div className={`relative shrink-0 transition-all duration-300 ${isActing ? 'scale-105' : ''} ${(player.state === 'FOLDED' || player.disconnected) ? 'opacity-40 grayscale' : ''}`}>
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarColor} flex items-center justify-center text-[11px] font-bold text-white shadow-md ${isActing ? 'ring-2 ring-accent-gold ring-offset-1 ring-offset-[#1d6349] shadow-glow' : ''}`}>
                  {getInitials(player.name)}
                </div>
                {player.disconnected && (
                  <div className="absolute -top-0.5 -left-0.5 w-2 h-2 bg-amber-400 rounded-full animate-pulse" title="Reconnecting…" />
                )}
                {gameState.buttonIndex === serverIndex && (
                  <div className="absolute -right-0.5 -bottom-0.5 w-3.5 h-3.5 bg-white text-black text-[7px] rounded-full flex items-center justify-center font-bold shadow-sm">
                    D
                  </div>
                )}
                {player.kickPending && (
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-400 rounded-full" title="Leaving after hand" />
                )}
                {player.isBot && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      socket.emit('toggleBotKick', player.seatIndex);
                    }}
                    title={player.kickPending ? "Cancel kick" : "Remove bot after hand"}
                    className={`absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full border transition-colors z-30 ${
                      player.kickPending
                        ? "bg-white/10 border-white/20 text-white/70 hover:bg-white/15"
                        : "bg-red-500/80 border-red-400/40 text-white hover:bg-red-500"
                    }`}
                  >
                    {player.kickPending ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                )}
                {player.currentBet > 0 && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-1.5 z-20">
                    <span className="bet-chip">${player.currentBet}</span>
                  </div>
                )}
              </div>

              <div className="stack-chip mt-0.5 w-full max-w-[80px] shrink-0">
                <p className="text-[8px] text-white/55 font-medium truncate leading-tight">{player.name}</p>
                <p className="text-[10px] font-semibold text-emerald-200 tabular-nums leading-tight">${player.stack}</p>
              </div>

              {/* Top seats: hole cards below info, facing inward */}
              {isTop && holeCards && (
                <div className="flex mt-0.5 shrink-0">{holeCards}</div>
              )}

              {player.disconnected ? (
                <span className="text-[8px] font-semibold uppercase tracking-wider mt-0.5 shrink-0 text-amber-300">
                  Reconnecting…
                </span>
              ) : (player.state === 'FOLDED' || player.isAllIn) && (
                <span className={`text-[8px] font-semibold uppercase tracking-wider mt-0.5 shrink-0 ${player.isAllIn ? 'text-red-300' : 'text-white/40'}`}>
                  {player.isAllIn ? 'All in' : 'Fold'}
                </span>
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
