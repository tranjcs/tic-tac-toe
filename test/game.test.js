'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Game, getResult } = require('../src/game');
const { Mark, DRAW } = require('../src/constants');

const _ = null;
const { X, O } = Mark;

describe('getResult', () => {
  it('returns null for an unfinished board', () => {
    assert.equal(getResult([X, _, _, _, O, _, _, _, _]), null);
  });

  it('detects rows, columns and diagonals', () => {
    assert.equal(getResult([X, X, X, O, O, _, _, _, _]), X);
    assert.equal(getResult([O, X, _, O, X, _, O, _, X]), O);
    assert.equal(getResult([X, O, _, O, X, _, _, _, X]), X);
    assert.equal(getResult([_, _, O, X, O, X, O, X, _]), O);
  });

  it('detects a draw', () => {
    assert.equal(getResult([X, O, X, X, O, O, O, X, X]), DRAW);
  });

  it('prefers a win on the final move over a draw', () => {
    assert.equal(getResult([X, O, X, O, X, O, O, X, X]), X);
  });
});

describe('Game', () => {
  it('starts empty with X to move', () => {
    const game = new Game();
    assert.deepEqual(game.toJSON(), { board: Array(9).fill(null), turn: X, result: null, timedOut: null });
  });

  it('alternates turns', () => {
    const game = new Game();
    assert.equal(game.play(X, 0), true);
    assert.equal(game.turn, O);
    assert.equal(game.play(O, 1), true);
    assert.equal(game.turn, X);
  });

  it('rejects moves out of turn', () => {
    const game = new Game();
    assert.equal(game.play(O, 0), false);
    assert.equal(game.board[0], null);
  });

  it('rejects occupied cells', () => {
    const game = new Game();
    game.play(X, 4);
    assert.equal(game.play(O, 4), false);
    assert.equal(game.board[4], X);
  });

  it('rejects invalid cell input', () => {
    const game = new Game();
    for (const cell of [-1, 9, 1.5, '0', null, undefined, {}, NaN]) {
      assert.equal(game.play(X, cell), false, `cell=${String(cell)}`);
    }
    assert.deepEqual(game.board, Array(9).fill(null));
  });

  it('ends on a win and rejects further moves', () => {
    const game = new Game();
    [[X, 0], [O, 3], [X, 1], [O, 4], [X, 2]].forEach(([m, c]) => game.play(m, c));
    assert.equal(game.result, X);
    assert.equal(game.isOver, true);
    assert.equal(game.play(O, 5), false);
  });

  it('toJSON returns a copy of the board', () => {
    const game = new Game();
    game.toJSON().board[0] = X;
    assert.equal(game.board[0], null);
  });

  it('timing out forfeits the game to the opponent', () => {
    const game = new Game();
    game.play(X, 0);
    assert.equal(game.timeOut(), true);
    assert.deepEqual([game.result, game.timedOut], [X, O]);
    assert.equal(game.play(O, 1), false);
    assert.equal(game.timeOut(), false, 'cannot time out a finished game');
  });
});
