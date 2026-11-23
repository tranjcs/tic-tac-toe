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
  ACTIVE: 'active', // client heartbeat: someone is using this tab
});

/** Why the server refused a connection (the client sees it as connect_error's message). */
const ConnectError = Object.freeze({
  FULL: 'server-full', // the lobby already holds the most players allowed
  TOO_MANY: 'too-many-connections', // this address already has the most connections allowed
});

module.exports = { Mark, DRAW, Status, Events, ConnectError };
