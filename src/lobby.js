'use strict';

const { Game } = require('./game');
const { Mark, Status } = require('./constants');

/**
 * Manages the line of connected players and the single active game.
 *
 * The first two players in the queue play; everyone else waits in line.
 * After a game ends the winner stays on and the loser moves to the back of
 * the line (on a draw both move to the back). Independent of Socket.IO so it
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
  }

  /** @returns {string[]} ids of all connected players */
  get playerIds() {
    return [...this.queue];
  }

  join(id) {
    if (this.queue.includes(id)) return;
    this.queue.push(id);
    this.startGameIfPossible();
    this.onChange();
  }

  leave(id) {
    if (!this.queue.includes(id)) return;
    this.queue = this.queue.filter((queued) => queued !== id);
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

    const state = { playerCount: this.queue.length };
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
      Object.assign(state, this.game.toJSON());
    }
    return state;
  }

  /** Stops pending timers. Call on shutdown. */
  dispose() {
    clearTimeout(this.rotationTimer);
    this.rotationTimer = null;
  }

  startGameIfPossible() {
    if (this.game || this.queue.length < 2) return;
    this.game = new Game();
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
