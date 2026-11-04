'use strict';

/** Player marks. X always moves first. */
const Mark = Object.freeze({ X: 'X', O: 'O' });

/** Game outcome when the board fills with no winner. */
const DRAW = 'draw';

/** What a connected client is currently doing. */
const Status = Object.freeze({
  WAITING: 'waiting', // alone, waiting for an opponent
  PLAYING: 'playing', // one of the two active players
  IN_LINE: 'in-line', // queued behind the current game
});

/** Socket.IO event names shared by server and client. */
const Events = Object.freeze({
  STATE: 'state',
  MOVE: 'move',
});

module.exports = { Mark, DRAW, Status, Events };
