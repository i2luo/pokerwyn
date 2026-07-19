"use strict";

const PlayerState = {
  READY: "READY",
  IN_GAME: "IN_GAME",
  FOLDED: "FOLDED",
  AWAY: "AWAY",
  LEFT: "LEFT",
  OFFLINE: "OFFLINE",
};

const HandRank = Object.freeze({
  HIGH_CARD: { name: "High Card", value: 1 },
  ONE_PAIR: { name: "One Pair", value: 2 },
  TWO_PAIR: { name: "Two Pair", value: 3 },
  THREE_OF_A_KIND: { name: "Three of a Kind", value: 4 },
  STRAIGHT: { name: "Straight", value: 5 },
  FLUSH: { name: "Flush", value: 6 },
  FULL_HOUSE: { name: "Full House", value: 7 },
  FOUR_OF_A_KIND: { name: "Four of a Kind", value: 8 },
  STRAIGHT_FLUSH: { name: "Straight Flush", value: 9 },
  ROYAL_FLUSH: { name: "Royal Flush", value: 10 }, // Highest possible straight flush (10-Ace)
});

class Player {
  constructor(seatIndex, name, socketId = null, isBot = false) {
    this.seatIndex = parseInt(seatIndex);
    this.name = name;
    this.socketId = socketId;
    this.hand = [];
    this.stack = 0;
    this.currentBet = 0;
    this.state = PlayerState.READY;
    this.isAllIn = false;
    this.isButton = false;
    this.handDesc = null; 
    this.socketId = null;
    this.actedThisRound = false;
    this.isBot = isBot;
    // Set true while the player's socket is gone but they still hold a seat,
    // waiting out the reconnect grace window before being kicked.
    this.disconnected = false;
    // Handle for the pending kick timer so a reconnect can cancel it.
    this.reconnectTimer = null;
  }

  getSeat() {
    return this.seatIndex;
  }

  getHand() {
    return this.handDesc;
  }

  getStack() {
    return this.stack;
  }

  getBet() {
    return this.currentBet;
  }

  getState() {
    return this.state;
  }

  getAllIn() {
    return this.isAllIn;
  }

  getButton() {
    return this.isButton;
  }

  bet(amount) {
    if (amount <= 0 || amount > this.stack) {
      return false;
    }
    this.currentBet += amount;
    this.stack -= amount;
    return true;
  }

  allIn() {
    if (this.stack > 0) {
      this.currentBet += this.stack;
      this.isAllIn = true;
      this.stack = 0;
    }
  }

  resetBet() {
    this.currentBet = 0;
  }

  resetForNewHand() {
    this.currentBet = 0;
    this.isAllIn = false;
    this.clearCards();
    this.actedThisRound = false;
}


  addCards(cards) {
    if (this.hand.length + cards.length <= 2) {
      this.hand.push(...cards);
    }
  }

  clearCards() {
    this.hand = [];
    this.handDesc = null;
  }

  getCards() {
    return this.hand;
  }

  Back() {
    this.state = PlayerState.READY;
  }

  updateHandDescription() {
    this.handDesc = HandRank.HIGH_CARD;
  }

  setName(NewName) {
    this.name = NewName;
  }

  setStack(NewStack) {
    this.stack = NewStack;
  }

  resetStage() {
    if (this.state === PlayerState.FOLDED || this.state === Player.READY) {
      this.state = PlayerState.IN_GAME;
    }
  }

  left() {
    this.state = PlayerState.LEFT;
  }

  away() {
    this.state = PlayerState.AWAY;
  }

  fold() {
    this.state = PlayerState.FOLDED;
  }

  get isActive() {
    return this.state === PlayerState.IN_GAME && this.stack > 0 && !this.isAllIn;
  }
}

module.exports = { Player, PlayerState };
