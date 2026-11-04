'use strict';

const { Mark, DRAW } = require('./constants');

const BOARD_SIZE = 9;

const WINNING_LINES = Object.freeze([
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],            // diagonals
]);

/**
 * Returns the winning mark, DRAW if the board is full, or null if play continues.
 * @param {ReadonlyArray<string|null>} board
 * @returns {string|null}
 */
function getResult(board) {
  for (const [a, b, c] of WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return board.every(Boolean) ? DRAW : null;
}

/** A single game of tic-tac-toe. Pure logic, no networking. */
class Game {
  constructor() {
    this.board = Array(BOARD_SIZE).fill(null);
    this.turn = Mark.X;
    this.result = null;
  }

  get isOver() {
    return this.result !== null;
  }

  /**
   * Attempts a move. Invalid moves are rejected without changing state.
   * @param {string} mark - Mark.X or Mark.O
   * @param {unknown} cell - index 0-8 (untrusted input)
   * @returns {boolean} whether the move was applied
   */
  play(mark, cell) {
    if (this.isOver || mark !== this.turn) return false;
    if (!Number.isInteger(cell) || cell < 0 || cell >= BOARD_SIZE) return false;
    if (this.board[cell] !== null) return false;

    this.board[cell] = mark;
    this.result = getResult(this.board);
    if (!this.isOver) {
      this.turn = mark === Mark.X ? Mark.O : Mark.X;
    }
    return true;
  }

  toJSON() {
    return { board: [...this.board], turn: this.turn, result: this.result };
  }
}

module.exports = { Game, getResult, BOARD_SIZE };
