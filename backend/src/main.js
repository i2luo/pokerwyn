"use strict";

const http = require("http");
const crypto = require("crypto");
const express = require("express");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const Table = require("../engine/table");
const { Player } = require("../engine/player");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Secret used to sign session tokens. Set JWT_SECRET in the environment for
// production; the fallback keeps local development working out of the box.
const JWT_SECRET = process.env.JWT_SECRET || "pokerwyn-dev-secret";

const table = new Table();

// How long a player may stay seated (dimmed, in a "Reconnecting" state) after
// their socket drops before they are officially kicked from the table.
const RECONNECT_GRACE_MS = 60000;

let globalActionTimeout = null;

function resetTurnTimer() {
    // Clear existing timer
    if (globalActionTimeout) {
        clearTimeout(globalActionTimeout);
        globalActionTimeout = null;
    }

    // If valid player to act start a new timer
    if (table.currentPlayerIndex !== -1 && table.handInProgress) {
        globalActionTimeout = setTimeout(() => {
            const currentPlayer = table.players[table.currentPlayerIndex];
            if (currentPlayer) {
                console.log(`⏰ ${currentPlayer.name} timed out - auto-folding`);
                
                table.playerAction(currentPlayer.name, "FOLD", 0);
                
                table.broadcast(io);
                
                // Recursively reset timer
                resetTurnTimer();
            }
        }, 30000);  // 30 seconds
    }
}

// Update table event handler to reset timer on async state changes (like the 2s delay)
table.setEventHandler(() => {
    io.emit("state", table.getState());
    resetTurnTimer(); // Ensure timer restarts after the 2s delay
});

io.on("connection", (socket) => {
  console.log(`🟢 Player connected: ${socket.id}`);
  socket.emit("state", table.getState());

  socket.on("join", ({ name, stack }) => {
    const seatIndex = table.players.length;
    const newPlayer = new Player(seatIndex, name);
    newPlayer.stack = stack;
    newPlayer.socketId = socket.id;
    // Stable identity that outlives the socket id, so the player can be
    // recognised again after a page reload via their session token.
    newPlayer.playerId = crypto.randomUUID();
    const success = table.addPlayer(newPlayer);

    if (!success) {
      socket.emit("error", "Table is full");
      return;
    }

    // The engine may rename the player to keep names unique; sign the final name.
    const sessionToken = jwt.sign(
      { playerId: newPlayer.playerId, name: newPlayer.name },
      JWT_SECRET
    );

    socket.emit("joined", { seatIndex: newPlayer.seatIndex, name: newPlayer.name, stack, sessionToken });
    console.log(`👤 ${newPlayer.name} (seat ${newPlayer.seatIndex}) joined with ${stack} bb`);
    table.broadcast(io);
  });

  socket.on("resume", ({ sessionToken }) => {
    let payload;
    try {
      payload = jwt.verify(sessionToken, JWT_SECRET);
    } catch (err) {
      // Token is missing/invalid/tampered — client should fall back to joining.
      socket.emit("resumeFailed");
      return;
    }

    const player = table.players.find(p => p.playerId === payload.playerId);
    if (!player) {
      // The seat no longer exists (e.g. the player was removed). Fall back to join.
      socket.emit("resumeFailed");
      return;
    }

    // They beat the reconnect timer: cancel the pending kick and undim them.
    if (player.reconnectTimer) {
      clearTimeout(player.reconnectTimer);
      player.reconnectTimer = null;
      console.log(`✅ ${player.name} reconnected within the grace window`);
    }
    player.disconnected = false;

    // Re-attach this fresh socket to the existing player.
    player.socketId = socket.id;
    const seatIndex = table.players.indexOf(player);

    socket.emit("joined", { seatIndex, name: player.name, stack: player.stack, sessionToken });
    console.log(`🔄 ${player.name} resumed session (seat ${seatIndex})`);
    table.broadcast(io);
  });

  socket.on("action", ({ name, action, amount }) => {
    const success = table.playerAction(name, action, amount);
    if (success) {
      table.broadcast(io);
      resetTurnTimer(); // Reset master timer
    }
  });

  socket.on("start-hand", () => {
    const ok = table.startHand();
    if (!ok) {
        const playersWithChips = table.players.filter(p => p.state !== 'LEFT' && p.stack > 0);
        if (playersWithChips.length === 1) {
            io.emit("game-over", {
                winner: playersWithChips[0].name,
                chips: playersWithChips[0].stack
            });
            console.log("🎊🎊🎊 TOURNAMENT COMPLETE 🎊🎊🎊");
        } else {
            socket.emit("error", "Not enough players");
        }
        return;
    }
    table.broadcast(io);
    resetTurnTimer(); // Start timer for first player
  });

  socket.on("disconnect", () => {
    console.log(`🔴 Socket disconnected: ${socket.id}`);

    const player = table.players.find(p => p.socketId === socket.id);
    // Unknown socket (spectator, bot, or already-removed player): nothing to do.
    if (!player) return;

    // Don't kick them or fold their hand yet — a page reload looks just like a
    // disconnect. Put them in a temporary "Reconnecting" state and dim them so
    // other players know, then give them a grace window to come back.
    player.disconnected = true;
    console.log(`🟠 ${player.name} disconnected — reconnect window open (${RECONNECT_GRACE_MS / 1000}s)`);

    if (player.reconnectTimer) clearTimeout(player.reconnectTimer);
    player.reconnectTimer = setTimeout(() => {
      player.reconnectTimer = null;
      // Grace window expired: officially kick them, stand them up from the
      // table, and clear their seat (handlePlayerExit folds an active hand and
      // removes the seat when no hand is in progress).
      console.log(`⌛ ${player.name} did not reconnect — kicking from table`);
      player.disconnected = false;
      table.handlePlayerExit(player);
      table.broadcast(io);
    }, RECONNECT_GRACE_MS);

    table.broadcast(io);
  });

  socket.on("add-bot", () => {
    const seatIndex = table.players.length;
    const botName = "Bot-" + Math.floor(Math.random() * 1000);
    
    // Create a new player (table.addPlayer guarantees the final name is unique)
    const newBot = new Player(seatIndex, botName);
    newBot.stack = 1000;
    newBot.isBot = true;
    newBot.socketId = "BOT-" + botName; 

    const success = table.addPlayer(newBot);
    if (success) {
        console.log(`🤖 ${botName} added to table`);
        table.broadcast(io);
    } else {
        socket.emit("error", "Table is full");
    }
  });

  socket.on('sendChat', ({ tableId, text }) => {
    const currentTable = table; 
    
    if (!currentTable) return;
    if (!text || typeof text !== 'string') return;

    // Identify Sender
    let senderName = "Spectator";
    const player = currentTable.players.find(p => p.socketId === socket.id);
    if (player) {
        senderName = player.name;
    }

    // Add to Table State
    const msg = currentTable.addChatMessage(senderName, text);

    // Broadcast to everyone
    io.emit('chatUpdate', msg); 
  });

  socket.on('toggleBotKick', (seatIndex) => {
      table.toggleBotKick(seatIndex);
  });

  socket.on('showHand', () => {
      // Find player by socket ID
      const player = table.players.find(p => p.socketId === socket.id);
      if (player) {
          table.showHand(player.seatIndex);
      }
  });

  socket.on('rebuy', ({ amount }) => {
      table.rebuyPlayer(socket.id, amount);
  });

  socket.on('resetTable', () => {
      table.hardReset();
      // Tell all clients to drop their seat and go back to login screen
      io.emit('tableReset'); 
  });
});

server.listen(3000, () => {
  console.log("🚀 Poker server running on http://localhost:3000");
});