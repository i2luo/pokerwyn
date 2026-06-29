"use strict";

const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const Table = require("../engine/table");
const { Player } = require("../engine/player");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const table = new Table();

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
    const success = table.addPlayer(newPlayer);

    if (!success) {
      socket.emit("error", "Table is full");
      return;
    }

    socket.emit("joined", { seatIndex, name, stack });
    console.log(`👤 ${name} (seat ${seatIndex}) joined with ${stack} bb`);
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
    table.removePlayerBySocketId(socket.id);
    table.broadcast(io);
    console.log(`🔴 Player disconnected: ${socket.id}`);
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