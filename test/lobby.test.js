'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Lobby } = require('../src/lobby');
const { Mark, Status } = require('../src/constants');

const DELAY = 1000;

/** Plays moves for X (`x`) and O (`o`) alternately, starting with X. */
function playMoves(lobby, x, o, cells) {
  cells.forEach((cell, i) => assert.equal(lobby.move(i % 2 === 0 ? x : o, cell), true));
}

const X_WINS = [0, 3, 1, 4, 2];
const O_WINS = [0, 3, 1, 4, 8, 5];
const DRAW_GAME = [0, 1, 2, 4, 3, 5, 7, 6, 8];

describe('Lobby', () => {
  let lobby;
  let onChange;

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] });
    onChange = mock.fn();
    lobby = new Lobby({ onChange, resultDelayMs: DELAY });
  });

  afterEach(() => {
    lobby.dispose();
    mock.timers.reset();
  });

  it('a lone player is waiting', () => {
    lobby.join('a');
    assert.equal(lobby.stateFor('a').status, Status.WAITING);
    assert.equal(lobby.stateFor('a').board, undefined);
  });

  it('two players start a game; first is X', () => {
    lobby.join('a');
    lobby.join('b');
    assert.equal(lobby.stateFor('a').status, Status.PLAYING);
    assert.equal(lobby.stateFor('a').mark, Mark.X);
    assert.equal(lobby.stateFor('b').mark, Mark.O);
  });

  it('extra players are in line with their position', () => {
    ['a', 'b', 'c', 'd'].forEach((id) => lobby.join(id));
    assert.deepEqual(
      [lobby.stateFor('c').status, lobby.stateFor('c').position],
      [Status.IN_LINE, 1],
    );
    assert.equal(lobby.stateFor('d').position, 2);
    assert.equal(lobby.stateFor('d').playerCount, 4);
  });

  it('ignores duplicate joins and unknown leaves', () => {
    lobby.join('a');
    lobby.join('a');
    lobby.leave('zzz');
    assert.deepEqual(lobby.playerIds, ['a']);
    assert.equal(onChange.mock.callCount(), 1);
  });

  it('returns null state for unknown players', () => {
    assert.equal(lobby.stateFor('nobody'), null);
  });

  it('rejects moves from spectators and out of turn', () => {
    ['a', 'b', 'c'].forEach((id) => lobby.join(id));
    assert.equal(lobby.move('c', 0), false);
    assert.equal(lobby.move('b', 0), false);
    assert.equal(lobby.move('a', 0), true);
  });

  it('notifies on every state change', () => {
    lobby.join('a');
    lobby.join('b');
    lobby.move('a', 0);
    lobby.move('a', 1); // rejected
    assert.equal(onChange.mock.callCount(), 3);
  });

  it('shows the result, then the loser (O) goes to the back', () => {
    ['a', 'b', 'c'].forEach((id) => lobby.join(id));
    playMoves(lobby, 'a', 'b', X_WINS);
    assert.equal(lobby.stateFor('c').result, Mark.X);
    assert.equal(lobby.move('b', 5), false, 'no moves after the game ends');

    mock.timers.tick(DELAY - 1);
    assert.deepEqual(lobby.playerIds, ['a', 'b', 'c']);
    mock.timers.tick(1);
    assert.deepEqual(lobby.playerIds, ['a', 'c', 'b']);
    assert.equal(lobby.stateFor('a').mark, Mark.X);
    assert.equal(lobby.stateFor('c').mark, Mark.O);
    assert.equal(lobby.stateFor('b').position, 1);
    assert.equal(lobby.stateFor('a').result, null, 'fresh game');
  });

  it('when O wins, X goes to the back', () => {
    ['a', 'b', 'c'].forEach((id) => lobby.join(id));
    playMoves(lobby, 'a', 'b', O_WINS);
    mock.timers.tick(DELAY);
    assert.deepEqual(lobby.playerIds, ['b', 'c', 'a']);
    assert.equal(lobby.stateFor('b').mark, Mark.X);
  });

  it('on a draw both players go to the back', () => {
    ['a', 'b', 'c', 'd'].forEach((id) => lobby.join(id));
    playMoves(lobby, 'a', 'b', DRAW_GAME);
    assert.equal(lobby.stateFor('a').result, 'draw');
    mock.timers.tick(DELAY);
    assert.deepEqual(lobby.playerIds, ['c', 'd', 'a', 'b']);
  });

  it('with only two players, they play again', () => {
    lobby.join('a');
    lobby.join('b');
    playMoves(lobby, 'a', 'b', X_WINS);
    mock.timers.tick(DELAY);
    assert.equal(lobby.stateFor('a').status, Status.PLAYING);
    assert.equal(lobby.stateFor('b').status, Status.PLAYING);
  });

  it('when a player leaves mid-game, the next in line steps in', () => {
    ['a', 'b', 'c'].forEach((id) => lobby.join(id));
    lobby.move('a', 0);
    lobby.leave('a');
    assert.equal(lobby.stateFor('b').mark, Mark.X);
    assert.equal(lobby.stateFor('c').mark, Mark.O);
    assert.deepEqual(lobby.stateFor('b').board, Array(9).fill(null));
  });

  it('when a player leaves and nobody is in line, the other waits', () => {
    lobby.join('a');
    lobby.join('b');
    lobby.leave('b');
    assert.equal(lobby.stateFor('a').status, Status.WAITING);
  });

  it('leaving during the result delay cancels the pending rotation', () => {
    ['a', 'b', 'c'].forEach((id) => lobby.join(id));
    playMoves(lobby, 'a', 'b', X_WINS);
    lobby.leave('b');
    assert.deepEqual(lobby.playerIds, ['a', 'c']);
    lobby.move('a', 4);
    mock.timers.tick(DELAY);
    assert.equal(lobby.stateFor('a').board[4], Mark.X, 'new game was not rotated away');
  });

  it('a spectator leaving does not affect the game', () => {
    ['a', 'b', 'c'].forEach((id) => lobby.join(id));
    lobby.move('a', 0);
    lobby.leave('c');
    assert.equal(lobby.stateFor('a').board[0], Mark.X);
  });
});
