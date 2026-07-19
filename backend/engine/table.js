const Deck = require("./deck");
const Pot = require("./pot");
const Snapshot = require("./snapshot");
const { Showdown } = require("./showdown");
const { PlayerState } = require("./player");
const { Hand } = require("pokersolver");
const { getPreflopEquity } = require('./preflopEquity');
const { calculateEquity } = require('./equity');
const PokerOdds = require("poker-odds-calculator");
const OddsCalculator = PokerOdds.OddsCalculator || (PokerOdds.default && PokerOdds.default.OddsCalculator);
const CardGroup = PokerOdds.CardGroup || (PokerOdds.default && PokerOdds.default.CardGroup);

class Table {
    constructor(maxPlayers = 9, deck = null, smallBlind = 5, bigBlind = 10) {
        this.maxPlayers = maxPlayers;
        this.players = [];
        this.deck = deck ?? new Deck();
        this.pot = [new Pot()];
        this.communityCards = [];
        this.buttonIndex = -1; 
        this.currentBet = 0;
        this.currentPlayerIndex = 0;
        this.handInProgress = false;
        this.smallBlind = smallBlind;
        this.bigBlind = bigBlind;
        this.minRaiseAmount = this.bigBlind;
        this.lastAggressorIndex = -1;
        this.lastWinDetails = null;
        this.onStateChange = null;
        this.chatMessages = [];
        this.animationDelay = (process.env.NODE_ENV === 'test') ? 0 : 2000;
    }

    // Updates everyone (Lookup Table)
    updatePreflopEquities() {
        if (this.stage !== 'preflop') return;

        const activePlayers = this.players.filter(p => 
            p.state !== PlayerState.FOLDED && 
            p.state !== PlayerState.LEFT && 
            p.state !== PlayerState.SITTING_OUT && 
            p.state !== PlayerState.WAITING
        );
        const count = activePlayers.length;

        this.players.forEach(p => {
            if (activePlayers.includes(p) && p.hand && p.hand.length === 2) {
                const formatCard = (c) => {
                    if (typeof c === 'string') return c;
                    const r = c.rank || c.value; const s = c.suit || c.type;
                    return `${r}${s}`;
                };
                const handStrings = p.hand.map(formatCard);
                p.equity = getPreflopEquity(handStrings, count);
            } else if (p.state === PlayerState.FOLDED) {
                p.equity = 0;
            }
        });
        
        if (this.onStateChange) this.onStateChange();
    }

    // Updates only the current player (Monte Carlo)
    updateCurrentPlayerPostflopEquity() {
        // Must be Postflop and have a valid player
        if (this.stage === 'preflop' || this.currentPlayerIndex === -1) return;

        const player = this.players[this.currentPlayerIndex];
        if (!player || !player.hand || player.hand.length !== 2) return;

        const activePlayersCount = this.players.filter(p => 
            p.state !== PlayerState.FOLDED && 
            p.state !== PlayerState.LEFT && 
            p.state !== PlayerState.SITTING_OUT && 
            p.state !== PlayerState.WAITING
        ).length;

        const formatCard = (c) => {
            if (typeof c === 'string') return c;
            const r = c.rank || c.value; const s = c.suit || c.type;
            return `${r}${s}`;
        };

        const handStrings = player.hand.map(formatCard);
        const boardStrings = this.communityCards.map(formatCard);

        console.log(`🧮 Calculating Postflop Equity for ${player.name}...`);
        
        player.equity = calculateEquity(handStrings, boardStrings, activePlayersCount);
        
        // Notify frontend
        if (this.onStateChange) this.onStateChange();
    }

    startHand() {
        this.players.forEach(p => {
            const isBustedBot = p.isBot && p.stack === 0;

            if (p.kickPending || isBustedBot) {
                console.log(`👢 Executing kick for ${p.name} (Reason: ${p.kickPending ? 'Manual' : 'Busted'})`);
                p.state = PlayerState.LEFT; // Mark as LEFT so cleanup filter catches them
            }
        });

        // Purge LEFT players
        this.players = this.players.filter(p => p.state !== PlayerState.LEFT);

        this.lastWinDetails = null;
        this.communityCards = [];
        this.pot = [new Pot()];
        this.currentBet = 0;
        
        for (const p of this.players) {
            p.showCards = false;
            p.resetForNewHand();
            
            // If they were waiting, they are now in
            if (p.stack > 0) {
                p.state = PlayerState.IN_GAME;
            } else {
                p.state = PlayerState.SITTING_OUT;
            }
        }

        const playersWithChips = this.players.filter(p => p.state === PlayerState.IN_GAME);
        
        if (playersWithChips.length < 2) {
            console.log("🏆 GAME OVER - Not enough players");
            if (playersWithChips.length === 1) {
                // If everyone else left, the last guy wins
                console.log(`🎊 ${playersWithChips[0].name} wins by default!`);
            }
            this.handInProgress = false;
            return false;
        }
        
        this.buttonIndex = (this.buttonIndex + 1) % this.players.length;
        
        let attempts = 0;
        while (this.players[this.buttonIndex].stack === 0 && attempts < this.players.length) {
            this.buttonIndex = (this.buttonIndex + 1) % this.players.length;
            attempts++;
        }

        if (this.deck && typeof this.deck.reset === "function") this.deck.reset();
        if (this.deck && typeof this.deck.shuffle === "function") this.deck.shuffle();

        this.handInProgress = true;
        this.currentBet = this.bigBlind;
        this.stage = 'preflop';
        this.minRaiseAmount = this.bigBlind;

        if (playersWithChips.length === 2) {
            const buttonPlayer = this.players[this.buttonIndex];
            const otherPlayerIndex = this.players.findIndex((p, i) => i !== this.buttonIndex && p.state === PlayerState.IN_GAME && p.stack > 0);
            const otherPlayer = this.players[otherPlayerIndex];
            
            if (buttonPlayer && buttonPlayer.stack > 0) {
                const sbAmount = Math.min(this.smallBlind, buttonPlayer.stack);
                buttonPlayer.bet(sbAmount);
                if (buttonPlayer.stack === 0) buttonPlayer.isAllIn = true; 
            }
            if (otherPlayer && otherPlayer.stack > 0) {
                const bbAmount = Math.min(this.bigBlind, otherPlayer.stack);
                otherPlayer.bet(bbAmount);
                if (otherPlayer.stack === 0) otherPlayer.isAllIn = true;
            }
            for (let i = 0; i < 2; i++) {
                for (const p of this.players) {
                    if (p.state === PlayerState.IN_GAME) p.addCards([this.deck.deal()]);
                }
            }
            this.currentPlayerIndex = this.buttonIndex;
            
        } else {
            const sbIndex = (this.buttonIndex + 1) % this.players.length;
            const bbIndex = (this.buttonIndex + 2) % this.players.length;
            const sbPlayer = this.players[sbIndex];
            const bbPlayer = this.players[bbIndex];
            
            if (sbPlayer && sbPlayer.state === PlayerState.IN_GAME && sbPlayer.stack > 0) {
                const sbAmount = Math.min(this.smallBlind, sbPlayer.stack);
                sbPlayer.bet(sbAmount);
                if (sbPlayer.stack === 0) sbPlayer.isAllIn = true;
            }
            if (bbPlayer && bbPlayer.state === PlayerState.IN_GAME && bbPlayer.stack > 0) {
                const bbAmount = Math.min(this.bigBlind, bbPlayer.stack);
                bbPlayer.bet(bbAmount);
                if (bbPlayer.stack === 0) bbPlayer.isAllIn = true;
            }
            for (let i = 0; i < 2; i++) {
                for (const p of this.players) {
                    if (p.state === PlayerState.IN_GAME) p.addCards([this.deck.deal()]);
                }
            }
            this.currentPlayerIndex = this.getNextActivePlayer(bbIndex);
        }
        
        if (this.currentPlayerIndex === -1) {
            this.resolveShowdown();
            return false;
        }

        this.updatePreflopEquities();
        this.checkAndTriggerBot();

        return true;
    }

    getUniqueName(desiredName) {
        const taken = new Set(this.players.map(p => p.name));
        if (!taken.has(desiredName)) return desiredName;

        let suffix = 2;
        let candidate = `${desiredName} (${suffix})`;
        while (taken.has(candidate)) {
            suffix++;
            candidate = `${desiredName} (${suffix})`;
        }
        return candidate;
    }

    addPlayer(player) {
        if (this.players.length >= this.maxPlayers) return false;

        // Player names are used as unique identifiers throughout the engine
        // (resolving actions, pot contributions, showdown). Duplicate names
        // (e.g. randomly generated bots colliding) cause actions to resolve
        // against the wrong player, which can stall the table. Enforce
        // uniqueness here so every seat is addressable.
        player.name = this.getUniqueName(player.name);

        // If a hand is in progress, new player must wait
        if (this.handInProgress) {
            console.log(`👤 ${player.name} joined as spectator (Waiting for next hand)`);
            player.state = 'WAITING'; // Custom state, inactive
        } else {
            player.state = PlayerState.READY;
        }
        
        this.players.push(player);
        return true;
    }

    removePlayer(name) {
        const player = this.players.find(p => p.name === name);
        if (!player) return;
        this.handlePlayerExit(player);
    }

    removePlayerBySocketId(socketId) {
        const player = this.players.find(p => p.socketId === socketId);
        if (!player) return;
        this.handlePlayerExit(player);
    }

    handlePlayerExit(player) {
        console.log(`🚪 ${player.name} left the table.`);

        // If they are currently in a hand, force FOLD
        if (this.handInProgress && player.state === PlayerState.IN_GAME) {
            console.log(`⚠️ Forcing FOLD for active player ${player.name}`);
            
            this.playerAction(player.name, 'FOLD');
        }

        // Mark as LEFT
        player.state = PlayerState.LEFT;
        player.stack = 0;
        
        // If hand is NOT in progress, we can safely remove them immediately
        if (!this.handInProgress) {
             this.players = this.players.filter(p => p !== player);
        }
        
        // Broadcast the update
        if (this.onStateChange) this.onStateChange();
    }

    getActivePlayers() {
        return this.players.filter(p => p.state === PlayerState.IN_GAME || p.state === PlayerState.READY);
    }

    getPlayerSeat(seatIndex) {
        return this.players.find(p => p.getSeat() === seatIndex);
    }

    getNextActivePlayer(startIndex) {
        const n = this.players.length;
        for (let i = 1; i <= n; i++) {
            const index = (startIndex + i) % n;
            const p = this.players[index];
            if (p.state === PlayerState.IN_GAME && p.stack > 0 && !p.isAllIn) {
                console.log(`[SEARCH] Found Next Active: ${p.name}`);
                return index;
            }
        }
        return -1;
    }

    nextBettingRound() {
    const len = this.communityCards.length;

    // Helper to safely deal
    const safeDeal = () => {
        const c = this.deck.deal();
        if (!c) throw new Error("Deck Empty");
        return c;
    };

    try {
        if (len === 0) {
            // Flop
            this.stage = 'flop';
            this.communityCards.push(safeDeal(), safeDeal(), safeDeal());
            
            this.calculateEquities();             
            console.log(`🃏 Flop dealt: ${this.communityCards.map(c => c.toString()).join(', ')}`);

        } else if (len === 3) {
            // Turn
            this.stage = 'turn';
            this.communityCards.push(safeDeal());
            
            this.calculateEquities();            
            console.log(`🃏 Turn dealt: ${this.communityCards[3].toString()}`);

        } else if (len === 4) {
            // River
            this.stage = 'river';
            this.communityCards.push(safeDeal());
            
            this.calculateEquities();            
            console.log(`🃏 River dealt: ${this.communityCards[4].toString()}`);

        } else {
            console.log("🏁 All betting rounds complete - going to showdown");
            this.resolveShowdown();
            this.currentPlayerIndex = -1;
            return;
        }

        // Force a state update to frontend immediately after calc
        if (this.onStateChange) this.onStateChange();

    } catch (e) {
        console.error("Error dealing next round:", e.message);
    }
}

    logDetailedState() {
        console.log("\n" + "=".repeat(60));
        console.log("DETAILED STATE:");
        console.log(`  Stage: ${this.stage}, CurrentBet: ${this.currentBet}`);
        console.log(`  CurrentPlayerIndex: ${this.currentPlayerIndex}`);
        console.log("  Players:");
        this.players.forEach((p, i) => {
            console.log(`    [${i}] ${p.name}: state=${p.state}, bet=${p.currentBet}, stack=${p.stack}, allIn=${p.isAllIn}, acted=${p.actedThisRound}`);
        });
        console.log("=".repeat(60) + "\n");
    }

    checkAndTriggerBot() {
        if (this.currentPlayerIndex === -1 || !this.handInProgress) return;

        const player = this.players[this.currentPlayerIndex];
        
        // Only proceed if valid player and marked as bot
        if (player && player.isBot) {
            console.log(`🤖 Bot ${player.name} is thinking...`);
            
            const delay = 1500 + Math.random() * 2000;
            
            setTimeout(async () => {
                // Fetch current player at the index again
                const currentPlayerAtTable = this.players[this.currentPlayerIndex];

                if (!this.handInProgress || !currentPlayerAtTable || currentPlayerAtTable.name !== player.name) {
                    return; 
                }

                try {
                    const BotBrain = require("./bot"); 
                    
                    const decision = await BotBrain.decide(player, this.getState()); // Pass formatted state
                    console.log(`🤖 Bot ${player.name} decides: ${decision.action}`);
                    
                    this.playerAction(player.name, decision.action, decision.amount);
                    
                    if (this.onStateChange) this.onStateChange();
                    
                } catch (e) {
                    console.error("Bot logic failed:", e);
                    this.playerAction(player.name, "FOLD"); 
                }
            }, delay);
        }
    }

    playerAction(name, action, amount = 0) {
        const act = String(action).toUpperCase();
        const player = this.players.find(p => p.name === name);
        if (!player) return false;
        if (player.state !== PlayerState.IN_GAME) return false;

        // Process action
        switch (act) {
            case "BET":
            case "RAISE":
                const targetTotalBet = amount;
                const amountToContribute = targetTotalBet - player.currentBet;
                if (player.bet(amountToContribute)) {
                    // Handle All In for raises
                    if (player.stack === 0) player.isAllIn = true;

                    const previousTotalBet = this.currentBet;
                    this.currentBet = Math.max(previousTotalBet, player.currentBet);
                    player.actedThisRound = true;
                    if (player.currentBet > previousTotalBet) {
                        this.minRaiseAmount = player.currentBet - previousTotalBet;
                        // Aggressive action: Reset others
                        for (const p of this.players) {
                            if (p.name !== name && p.state === PlayerState.IN_GAME && !p.isAllIn) {
                                p.actedThisRound = false;
                            }
                        }
                    }
                } else return false;
                break;

            case "CALL":
                const callAmount = Math.max(0, this.currentBet - player.currentBet);
                if (callAmount > 0) {
                    const actualAmount = Math.min(callAmount, player.stack);
                    player.bet(actualAmount);                        
                    if (player.stack === 0) player.isAllIn = true;
                }
                player.actedThisRound = true;
                break;

            case "CHECK":
                if (this.currentBet !== player.currentBet) return false;
                player.actedThisRound = true;
                break;

            case "FOLD":
                player.fold();
                player.actedThisRound = true;

                if (this.stage === 'preflop') {
                    this.updatePreflopEquities();
                }

                break;

            case "ALL_IN":
                player.allIn();
                
                const prevBet = this.currentBet;
                this.currentBet = Math.max(this.currentBet, player.currentBet);
                
                // Re-open action if this was a raise
                if (player.currentBet > prevBet) {
                    this.minRaiseAmount = player.currentBet - prevBet; // Update min raise
                    for (const p of this.players) {
                        if (p.name !== name && p.state === PlayerState.IN_GAME && !p.isAllIn) {
                            p.actedThisRound = false;
                        }
                    }
                }
                
                player.actedThisRound = true;
                break;
                
            default: return false;
        }

        // Check for end of round/hand
        const isFoldVictory = this.isHandOver();
        const isRoundComplete = this.isBettingRoundComplete();

        if (isFoldVictory || isRoundComplete) {
            console.log(`⏱️ Action complete. Delaying ${this.animationDelay}ms...`);
            
            this.currentPlayerIndex = -1;
            if (this.onStateChange) this.onStateChange();

            const resolveRound = () => {
                if (isFoldVictory) {
                    this.collectAndCreateSidePots();
                    this.resolveShowdown();
                    return;
                }

                this.collectAndCreateSidePots();
                
                for (const p of this.players) {
                    p.actedThisRound = false;
                    if (p.state === PlayerState.IN_GAME) p.currentBet = 0;
                }
                this.currentBet = 0;
                this.minRaiseAmount = this.bigBlind;

                const activePlayers = this.players.filter(p => p.state === PlayerState.IN_GAME || p.isAllIn);
                const canActPlayers = this.players.filter(p => p.state === PlayerState.IN_GAME && !p.isAllIn && p.stack > 0);
                
                if (canActPlayers.length <= 1 && activePlayers.length > 1) {
                    this.runOutBoard(); 
                } else {
                    this.nextBettingRound(); 
                    if (this.handInProgress) {
                        this.currentPlayerIndex = this.getNextActivePlayer(this.buttonIndex);

                        this.updateCurrentPlayerPostflopEquity();

                        this.checkAndTriggerBot(); 
                    }
                }

                if (this.onStateChange) this.onStateChange();
            };

            if (this.animationDelay > 0) {
                setTimeout(resolveRound, this.animationDelay);
            } else {
                resolveRound();
            }

            return true;
        } 
        else {
            this.currentPlayerIndex = this.getNextActivePlayer(this.currentPlayerIndex);

            if (this.stage !== 'preflop') {
                this.updateCurrentPlayerPostflopEquity();
            }

            this.checkAndTriggerBot(); 
        }

        return true;
    }

    collectAndCreateSidePots() {
        console.log("💵 Collecting chips and creating side pots...");
        
        // Filter out players who left
        let contributors = this.players.filter(p => p.currentBet > 0 && p.state !== 'LEFT')
            .map(p => ({ name: p.name, contribution: p.currentBet, isAllIn: p.isAllIn, originalPlayer: p }));
        
        const totalStreetContribution = contributors.reduce((sum, p) => sum + p.contribution, 0);
        if (totalStreetContribution === 0) return;

        this.pot = this.pot.filter(p => p.total > 0);
        let remainingContributions = contributors;

        while (remainingContributions.length > 0) {
            let activeContributors = remainingContributions.filter(p => 
                p.originalPlayer.state !== 'FOLDED' && 
                p.originalPlayer.state !== 'LEFT' &&
                p.originalPlayer.state !== 'SITTING_OUT' && 
                p.originalPlayer.state !== 'WAITING'
            );

            let currentCap = Infinity;

            if (activeContributors.length > 0) {
                currentCap = activeContributors.reduce((min, p) => Math.min(min, p.contribution), Infinity);
            } else {
                currentCap = remainingContributions.reduce((max, p) => Math.max(max, p.contribution), 0);
            }

            if (currentCap === 0) break;

            const newPot = new Pot();
            newPot.isSidePot = true;
            const playersToKeep = [];

            for (const playerContrib of remainingContributions) {
                const contributionToThisPot = Math.min(playerContrib.contribution, currentCap);
                
                newPot.addContribution(playerContrib.name, contributionToThisPot);
                playerContrib.contribution -= contributionToThisPot;
                
                if (playerContrib.contribution > 0) playersToKeep.push(playerContrib);
            }

            // Return uncalled bets
            const contributorsInPot = newPot.getPlayers();
            
            const activeContributorsInPot = contributorsInPot.filter(name => {
                const p = this.players.find(pl => pl.name === name);
                return p && p.state !== 'FOLDED';
            });

            if (contributorsInPot.length === 1 && activeContributorsInPot.length === 1) {
                const lonePlayerName = contributorsInPot[0];
                const lonePlayerObj = this.players.find(p => p.name === lonePlayerName);
                if (lonePlayerObj) {
                    console.log(`↩️ Returning uncalled bet of ${newPot.total} to ${lonePlayerName}`);
                    lonePlayerObj.stack += newPot.total;
                }
            } else {
                console.log(`  Pot Segment added (Cap: ${currentCap}): Total ${newPot.total}`);
                this.pot.push(newPot);
            }
            remainingContributions = playersToKeep;
        }
        
        for (const p of this.players) p.resetBet();
    }

    runOutBoard() {
        console.log("🎰 Running out the board...");
        while (this.communityCards.length < 5) {
            this.communityCards.push(this.deck.deal());
        }
        console.log(`🃏 Final board: ${this.communityCards.map(c => c.toString()).join(', ')}`);
        this.resolveShowdown();
    }

    isBettingRoundComplete() {
        const activePlayers = this.players.filter(p => p.state === PlayerState.IN_GAME && !p.isAllIn);
        const allInPlayers = this.players.filter(p => p.state === PlayerState.IN_GAME && p.isAllIn);
        
        if (activePlayers.length === 0) return true;
        
        const allActed = activePlayers.every(p => p.actedThisRound);
        if (!allActed) return false;
        
        return activePlayers.every(p => p.currentBet === this.currentBet);
    }

    resolveShowdown() {
        console.log("🏁 Starting Showdown Resolution...");
        
        let winDetails = [];

        try {
            const activePlayers = this.players.filter(p => 
                (p.state === PlayerState.IN_GAME || p.isAllIn) && 
                p.state !== PlayerState.FOLDED && 
                p.state !== PlayerState.LEFT
            );

            // Everyone else folded
            if (activePlayers.length === 1) {
                const winner = activePlayers[0];
                const totalPot = this.pot.reduce((sum, p) => sum + p.total, 0);
                
                winner.stack += totalPot;
                
                const winMsg = `${winner.name} wins $${totalPot} (opponent folded)`;
                console.log(`🏆 ${winMsg}`);
                this.addSystemMessage(winMsg);

                winDetails = [{ name: winner.name, amount: totalPot, desc: "Opponent Folded" }];
            }
            // Showdown
            else if (activePlayers.length > 1) {
                console.log("👀 Revealing cards for showdown...");
                activePlayers.forEach(p => p.showCards = true);

                const solvedHands = activePlayers.map(p => {
                    try {
                        const fmt = (c) => {
                            if (!c) return null;
                            if (typeof c === 'string') return c; 
                            let r = c.rank || c.value; let s = c.suit || c.type;
                            if (!r || !s) { if (c.toString) return c.toString(); return null; }
                            if (r.toString() === "10") r = "T";
                            return `${r}${s.toString().charAt(0).toLowerCase()}`;
                        };
                        const rawCards = p.hand.map(fmt).concat(this.communityCards.map(fmt)).filter(c => c);
                        if (rawCards.length === 0) return null;
                        return { player: p, solved: Hand.solve(rawCards) };
                    } catch (e) { return null; }
                }).filter(item => item !== null);

                if (solvedHands.length > 0) {
                    const winners = Hand.winners(solvedHands.map(i => i.solved));
                    const totalPot = this.pot.reduce((sum, p) => sum + p.total, 0);
                    const splitAmount = Math.floor(totalPot / winners.length);

                    winners.forEach(w => {
                        const match = solvedHands.find(s => s.solved.toString() === w.toString());
                        if (match) {
                            const winnerObj = match.player;
                            winnerObj.stack += splitAmount;
                            const desc = w.descr || w.name;
                            const winMsg = `${winnerObj.name} wins $${splitAmount} with ${desc}`;
                            this.addSystemMessage(winMsg);
                            winDetails.push({ name: winnerObj.name, amount: splitAmount, desc: desc });
                        }
                    });
                }
            }

        } catch (error) {
            console.error("❌ CRITICAL ERROR inside resolveShowdown:", error);
        } finally {
            this.players.forEach(p => {
                if (p.kickPending) {
                    console.log(`👋 Finalizing manual kick for ${p.name}`);
                    p.state = PlayerState.LEFT; 
                    p.stack = 0;
                }
            });

            // Freese state
            this.lastWinDetails = winDetails;
            this.currentPlayerIndex = -1; 
            this.handInProgress = false;  
            
            if (this.onStateChange) this.onStateChange();
            console.log("✅ Showdown complete. Waiting for Deal Hand.");
        }
    }

    snapshot() {
        const SnapshotModule = require("./snapshot");
        return SnapshotModule.create(this);
    }

    broadcast(io) { io.emit("state", this.getState()); }

    getState() {
        // Calculate pot totals
        const activeBets = this.players.reduce((sum, p) => sum + (p.currentBet || 0), 0);
        const safePots = this.pot.map(p => ({ 
            total: p.total ?? 0, 
            contributions: p.contributions ? Object.fromEntries(p.contributions) : {} 
        }));

        if (safePots.length > 0) safePots[0].total += activeBets;
        else if (activeBets > 0) safePots.push({ total: activeBets, contributions: {} });
        
        const totalPotValue = safePots.reduce((sum, p) => sum + p.total, 0);

        // Return state
        return {
            players: this.players.map((p, i) => {
                let currentDescription = "";
                let potOdds = 0;

                if (p.hand && p.hand.length > 0) {
                     try {
                        const fmt = (c) => {
                            if (!c) return null;
                            if (typeof c === 'string') return c; 
                            let r = c.rank || c.value; 
                            let s = c.suit || c.type;
                            if (!r || !s) {
                                if (typeof c.toString === 'function' && c.toString() !== '[object Object]') return c.toString();
                                return null;
                            }
                            if (r.toString() === "10") r = "T";
                            return `${r}${s.toString().charAt(0).toLowerCase()}`;
                        };

                        const playerCards = p.hand.map(fmt).filter(c => c);
                        const boardCards = this.communityCards.map(fmt).filter(c => c);
                        const allCards = playerCards.concat(boardCards);

                        if (allCards.length > 0) {
                            const solved = Hand.solve(allCards);
                            currentDescription = solved.descr || solved.name; 
                        }
                     } catch (e) {
                        console.error(`Hand Desc Error for ${p.name}:`, e.message); 
                     }
                }

                // Pot odds
                if (p.state === PlayerState.IN_GAME && this.currentBet > p.currentBet) {
                    const callAmt = this.currentBet - p.currentBet;
                    const finalPot = totalPotValue + callAmt;
                    if (finalPot > 0) potOdds = (callAmt / finalPot) * 100;
                }

                return {
                    seatIndex: i,
                    name: p.name,
                    stack: p.stack,
                    hand: p.hand,
                    state: p.state,
                    isActive: p.isActive,
                    currentBet: p.currentBet,
                    socketId: p.socketId,
                    isAllIn: p.isAllIn,
                    actedThisRound: p.actedThisRound,
                    showCards: p.showCards,
                    
                    handDescription: currentDescription,
                    
                    equity: Math.round(p.equity || 0), 
                    potOdds: Math.round(potOdds),
                    chatMessages: this.chatMessages,
                    isBot: p.isBot,
                    kickPending: p.kickPending,
                    disconnected: p.disconnected,
                };
            }),
            communityCards: [...this.communityCards],
            pot: safePots,
            currentBet: this.currentBet,
            minRaiseAmount: this.minRaiseAmount,
            currentPlayer: this.currentPlayerIndex,
            buttonIndex: this.buttonIndex,
            stage: this.stage,
            handInProgress: this.handInProgress,
            bigBlind: this.bigBlind,
            smallBlind: this.smallBlind,
            lastWinDetails: this.lastWinDetails,
        };
    }

    removePlayerBySocketId(id) {
        const index = this.players.findIndex(p => p.socketId === id);
        if (index !== -1) this.players.splice(index, 1);
    }

    isHandOver() {
        const nonFoldedPlayers = this.players.filter(p => p.state === PlayerState.IN_GAME || p.isAllIn);
        return nonFoldedPlayers.length <= 1;
    }

    resetForNextHand() {
        this.communityCards = [];
        this.pot = [new Pot()];
        this.currentBet = 0;
        this.handInProgress = false;
        for (const p of this.players) {
            p.resetBet();
            if (p.state !== PlayerState.LEFT) p.state = PlayerState.READY;
        }
    }

    endHand() {
        console.log("🎉 Hand ended! Final stacks:");
        this.players.forEach(p => {
            console.log(`  ${p.name}: ${p.stack} chips`);
            if (p.stack === 0) {
                console.log(`  ⚠️ ${p.name} is out of chips!`);
                p.state = PlayerState.LEFT;
            }
        });
        this.handInProgress = false;
        this.currentPlayerIndex = -1;
        this.communityCards = [];
        this.currentBet = 0;
        
        for (const p of this.players) {
            p.showCards = false;
            if (p.state === PlayerState.FOLDED || p.state === PlayerState.IN_GAME) {
                p.state = PlayerState.READY;
            }
            p.resetForNewHand();
        }
    }

    setEventHandler(callback) {
        this.onStateChange = callback;
    }

    logGameState() {
        const activePlayers = this.players.filter(p => p.state === PlayerState.IN_GAME)
            .map(p => `${p.name}(${p.state}, bet:${p.currentBet})`).join(', ');
        console.log(`📊 Stage: ${this.stage}, CurrentBet: ${this.currentBet}, Active: [${activePlayers}]`);
    }

    addChatMessage(senderName, text) {
        if (!text || text.trim().length === 0) return;
        
        const cleanText = text.trim().substring(0, 200);

        const msg = {
            id: Date.now() + Math.random(), // Unique ID for React keys
            sender: senderName,
            text: cleanText,
            type: 'user',
            timestamp: new Date().toISOString()
        };

        this.chatMessages.push(msg);

        // Only keep last 50 messages
        if (this.chatMessages.length > 50) {
            this.chatMessages.shift();
        }
        
        return msg;
    }

    // Handle system messages
    addSystemMessage(text) {
        const msg = {
            id: Date.now() + Math.random(),
            sender: "Dealer",
            text: text,
            type: 'system',
            timestamp: new Date().toISOString()
        };
        
        this.chatMessages.push(msg);
        if (this.chatMessages.length > 50) this.chatMessages.shift();
        
        return msg;
    }

    toggleBotKick(seatIndex) {
        const player = this.players.find(p => p.seatIndex === seatIndex);
        if (!player || !player.isBot) return;

        // Instant kick (Game not running)
        if (!this.handInProgress) {
            console.log(`👢 Instant kick for ${player.name}`);
            this.removePlayer(player.name);
        } 
        // Scheduled kick (Game running)
        else {
            player.kickPending = !player.kickPending;
            console.log(`🕒 Kick ${player.kickPending ? 'scheduled' : 'cancelled'} for ${player.name}`);

            if (player.kickPending && player.state === PlayerState.IN_GAME) {
                
                // Bot's turn. 
                if (this.players[this.currentPlayerIndex] === player) {
                    console.log(`👢 Bot ${player.name} is acting now -> Forcing FOLD.`);
                    this.playerAction(player.name, 'FOLD');
                } 
                // Someone else's turn. 
                else {
                    console.log(`👢 Bot ${player.name} kicked out of turn -> Force FOLD.`);
                    player.fold(); 
                    player.actedThisRound = true; 

                    if (this.stage === 'preflop') {
                        this.updatePreflopEquities();
                    }

                    if (this.isHandOver()) {
                         this.collectAndCreateSidePots(); 
                         this.resolveShowdown();
                    } else {
                        // Update UI to show they folded
                        if (this.onStateChange) this.onStateChange();
                    }
                }
            }
        }

        if (this.onStateChange) this.onStateChange();
    }

    showHand(seatIndex) {
        const p = this.players.find(player => player.seatIndex === seatIndex);
        
        // Validation: Player exists, has cards, and game is not in progress
        if (!p || !p.hand || p.hand.length === 0 || this.handInProgress) return;
        
        console.log(`👀 ${p.name} shows their hand.`);
        p.showCards = true; // Triggers the frontend to render their cards
        
        if (this.onStateChange) this.onStateChange();
    }

    rebuyPlayer(socketId, amount) {
        const player = this.players.find(p => p.socketId === socketId);
        if (!player) return;

        // Security checks:
        if (!this.handInProgress && player.stack === 0) {
            const safeAmount = Math.max(1, Math.min(amount, 1000));
            
            console.log(`💰 ${player.name} rebought for $${safeAmount}`);
            player.stack += safeAmount;
            
            // Ensure they are marked as ready for the next hand
            player.state = PlayerState.READY; 
            
            if (this.onStateChange) this.onStateChange();
        }
    }

    hardReset() {
        console.log("🚨 HARD RESET INITIATED");
        
        // Clear players
        this.players = [];
        
        // Reset game state
        this.communityCards = [];
        this.pot = [new Pot()];
        this.currentBet = 0;
        this.handInProgress = false;
        this.buttonIndex = -1;
        this.currentPlayerIndex = -1;
        this.lastWinDetails = null;
        this.stage = 'preflop';
        
        // Reset deck
        if (this.deck) {
            this.deck.reset();
            this.deck.shuffle();
        }

        // Clear chat
        this.chatMessages = [];

        // Broadcast empty state
        if (this.onStateChange) this.onStateChange();
    }
}

module.exports = Table;