'use strict';

const { Game } = require('./game');
const { Mark, Status } = require('./constants');

// Only names the server itself would hand out may be reclaimed on reconnect.
const NAME_PATTERN = /^Player ([1-9]\d{0,5})$/;

/**
 * Manages the line of connected players and the single active game.
 *
 * The first two players in the queue play; everyone else waits in line.
 * After a game ends the winner stays on and the loser moves to the back of
 * the line (on a draw both move to the back). Each player gets a name like
 * "Player 3", which they can reclaim when reconnecting. Independent of Socket.IO so it
 * can be unit tested; call `onChange` listeners to push state to clients.
 */
class Lobby {
  /**
   * @param {object} options
   * @param {() => void} options.onChange - called whenever any player's state changes
   * @param {number} options.resultDelayMs - how long to show a finished game's result
   */
  constructor({ onChange, resultDelayMs }) {
    this.onChange = onChange;
    this.resultDelayMs = resultDelayMs;
    /** @type {string[]} player ids in arrival order */
    this.queue = [];
    /** @type {Game|null} */
    this.game = null;
    /** @type {[string, string]|null} ids of the X and O players */
    this.players = null;
    this.rotationTimer = null;
    /** @type {Map<string, string>} player id -> display name */
    this.names = new Map();
    this.nextNumber = 0;
    /** Number of games started; the current game's id. */
    this.gameCount = 0;
  }

  /** @returns {string[]} ids of all connected players */
  get playerIds() {
    return [...this.queue];
  }

  /**
   * @param {string} id
   * @param {unknown} [requestedName] - untrusted; a name the client had before reconnecting
   */
  join(id, requestedName) {
    if (this.queue.includes(id)) return;
    this.names.set(id, this.assignName(requestedName));
    this.queue.push(id);
    this.startGameIfPossible();
    this.onChange();
  }

  leave(id) {
    if (!this.queue.includes(id)) return;
    this.queue = this.queue.filter((queued) => queued !== id);
    this.names.delete(id);
    if (this.players && this.players.includes(id)) {
      // Remaining player keeps their spot at the front; next in line steps up now.
      this.endGame();
    }
    this.startGameIfPossible();
    this.onChange();
  }

  /**
   * @param {string} id
   * @param {unknown} cell - untrusted client input
   * @returns {boolean} whether the move was applied
   */
  move(id, cell) {
    const mark = this.markOf(id);
    if (!mark || !this.game.play(mark, cell)) return false;
    if (this.game.isOver) {
      this.rotationTimer = setTimeout(() => this.rotatePlayers(), this.resultDelayMs);
    }
    this.onChange();
    return true;
  }

  /** @returns {string|null} the player's mark, or null if they aren't playing */
  markOf(id) {
    if (!this.players) return null;
    const index = this.players.indexOf(id);
    if (index === -1) return null;
    return index === 0 ? Mark.X : Mark.O;
  }

  /** Builds the state payload sent to a specific player. */
  stateFor(id) {
    const index = this.queue.indexOf(id);
    if (index === -1) return null;

    const state = {
      name: this.names.get(id),
      players: this.players
        ? { [Mark.X]: this.names.get(this.players[0]), [Mark.O]: this.names.get(this.players[1]) }
        : null,
      line: this.queue
        .filter((queued) => !this.players || !this.players.includes(queued))
        .map((queued) => this.names.get(queued)),
      playerCount: this.queue.length,
    };
    const mark = this.markOf(id);
    if (mark) {
      state.status = Status.PLAYING;
      state.mark = mark;
    } else if (!this.game) {
      state.status = Status.WAITING;
    } else {
      state.status = Status.IN_LINE;
      state.position = index - 1; // queue[0] and queue[1] are playing, so 1 = next up
    }
    if (this.game) {
      state.gameId = this.gameCount;
      Object.assign(state, this.game.toJSON());
    }
    return state;
  }

  /** Stops pending timers. Call on shutdown. */
  dispose() {
    clearTimeout(this.rotationTimer);
    this.rotationTimer = null;
  }

  /** Reuses a valid, unclaimed requested name; otherwise hands out the next number. */
  assignName(requestedName) {
    const match = typeof requestedName === 'string' ? NAME_PATTERN.exec(requestedName) : null;
    const inUse = match && [...this.names.values()].includes(requestedName);
    if (match && !inUse) {
      // Keep new numbers above any reclaimed one so they never collide.
      this.nextNumber = Math.max(this.nextNumber, Number(match[1]));
      return requestedName;
    }
    this.nextNumber += 1;
    return `Player ${this.nextNumber}`;
  }

  startGameIfPossible() {
    if (this.game || this.queue.length < 2) return;
    this.game = new Game();
    this.gameCount += 1;
    this.players = [this.queue[0], this.queue[1]];
  }

  endGame() {
    this.dispose();
    this.game = null;
    this.players = null;
  }

  rotatePlayers() {
    const [x, o] = this.players;
    const { result } = this.game;
    let losers;
    if (result === Mark.X) losers = [o];
    else if (result === Mark.O) losers = [x];
    else losers = [x, o];

    this.queue = this.queue.filter((id) => !losers.includes(id)).concat(losers);
    this.endGame();
    this.startGameIfPossible();
    this.onChange();
  }
}

module.exports = { Lobby };
