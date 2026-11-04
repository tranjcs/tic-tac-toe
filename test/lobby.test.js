'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Lobby } = require('../src/lobby');
const { Mark, Status } = require('../src/constants');

const DELAY = 1000;
const TURN = 15000;
const KICK = 60000;

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
  let onKick;

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    onChange = mock.fn();
    onKick = mock.fn();
    lobby = new Lobby({ onChange, onKick, resultDelayMs: DELAY, turnTimeoutMs: TURN, kickAfterMs: KICK });
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

  describe('names', () => {
    it('hands out sequential names', () => {
      ['a', 'b', 'c'].forEach((id) => lobby.join(id));
      assert.deepEqual(['a', 'b', 'c'].map((id) => lobby.stateFor(id).name), ['Player 1', 'Player 2', 'Player 3']);
    });

    it('never reuses a number after a player leaves', () => {
      lobby.join('a');
      lobby.join('b');
      lobby.leave('b');
      lobby.join('c');
      assert.equal(lobby.stateFor('c').name, 'Player 3');
    });

    it('lets a reconnecting player reclaim a free name', () => {
      lobby.join('a');
      lobby.join('b', 'Player 7');
      assert.equal(lobby.stateFor('b').name, 'Player 7');
      lobby.join('c');
      assert.equal(lobby.stateFor('c').name, 'Player 8', 'new numbers stay above reclaimed ones');
    });

    it('rejects a requested name that is already in use', () => {
      lobby.join('a');
      lobby.join('b', 'Player 1');
      assert.equal(lobby.stateFor('b').name, 'Player 2');
    });

    it('rejects malformed requested names', () => {
      const bad = ['<script>alert(1)</script>', 'Player 0', 'Player 01', 'Player 1234567', 'player 5', ' Player 5', 42, {}, null];
      bad.forEach((name, i) => lobby.join(`id${i}`, name));
      assert.deepEqual(
        bad.map((_, i) => lobby.stateFor(`id${i}`).name),
        bad.map((_, i) => `Player ${i + 1}`),
      );
    });

    it('frees a name when its player leaves', () => {
      lobby.join('a');
      lobby.leave('a');
      lobby.join('b', 'Player 1');
      assert.equal(lobby.stateFor('b').name, 'Player 1');
    });
  });

  describe('matchup and line', () => {
    it('a lone waiting player is the only one in line, with no matchup', () => {
      lobby.join('a');
      const state = lobby.stateFor('a');
      assert.equal(state.players, null);
      assert.deepEqual(state.line, ['Player 1']);
    });

    it('everyone sees the matchup and the line in order', () => {
      ['a', 'b', 'c', 'd'].forEach((id) => lobby.join(id));
      for (const id of ['a', 'b', 'c', 'd']) {
        const state = lobby.stateFor(id);
        assert.deepEqual(state.players, { X: 'Player 1', O: 'Player 2' });
        assert.deepEqual(state.line, ['Player 3', 'Player 4']);
      }
    });

    it('winner plays the next in line and the loser joins the back', () => {
      ['a', 'b', 'c', 'd'].forEach((id) => lobby.join(id));
      playMoves(lobby, 'a', 'b', X_WINS);
      mock.timers.tick(DELAY);
      const state = lobby.stateFor('d');
      assert.deepEqual(state.players, { X: 'Player 1', O: 'Player 3' });
      assert.deepEqual(state.line, ['Player 4', 'Player 2']);
    });
  });

  it('numbers each game so clients can tell games apart', () => {
    lobby.join('a');
    assert.equal(lobby.stateFor('a').gameId, undefined, 'no game yet');
    ['b', 'c'].forEach((id) => lobby.join(id));
    assert.equal(lobby.stateFor('c').gameId, 1);
    playMoves(lobby, 'a', 'b', X_WINS);
    assert.equal(lobby.stateFor('a').gameId, 1, 'same game while showing the result');
    mock.timers.tick(DELAY);
    assert.equal(lobby.stateFor('a').gameId, 2, 'rotation starts a new game');
    lobby.leave('c');
    assert.equal(lobby.stateFor('a').gameId, 3, 'a replacement game after a player leaves');
  });

  it('a spectator leaving does not affect the game', () => {
    ['a', 'b', 'c'].forEach((id) => lobby.join(id));
    lobby.move('a', 0);
    lobby.leave('c');
    assert.equal(lobby.stateFor('a').board[0], Mark.X);
  });

  describe('turn timer', () => {
    it('reports the time left to move, counting down', () => {
      lobby.join('a');
      assert.equal(lobby.stateFor('a').turnRemainingMs, undefined, 'no timer while waiting');
      lobby.join('b');
      assert.equal(lobby.stateFor('a').turnRemainingMs, TURN);
      mock.timers.tick(4000);
      assert.equal(lobby.stateFor('b').turnRemainingMs, TURN - 4000);
    });

    it('restarts after each move', () => {
      lobby.join('a');
      lobby.join('b');
      mock.timers.tick(TURN - 1);
      lobby.move('a', 0);
      assert.equal(lobby.stateFor('a').turnRemainingMs, TURN);
      mock.timers.tick(TURN - 1);
      assert.equal(lobby.stateFor('a').result, null, 'O still has 1ms');
    });

    it('a player who runs out of time loses and goes to the back', () => {
      ['a', 'b', 'c'].forEach((id) => lobby.join(id));
      lobby.move('a', 0);
      const calls = onChange.mock.callCount();
      mock.timers.tick(TURN);
      const state = lobby.stateFor('c');
      assert.deepEqual([state.result, state.timedOut], [Mark.X, Mark.O]);
      assert.equal(state.turnRemainingMs, undefined, 'no countdown on a finished game');
      assert.equal(onChange.mock.callCount(), calls + 1);

      mock.timers.tick(DELAY);
      assert.deepEqual(lobby.playerIds, ['a', 'c', 'b']);
      assert.equal(lobby.stateFor('a').turnRemainingMs, TURN, 'new game, fresh timer');
    });

    it('stops once the game is won', () => {
      ['a', 'b', 'c'].forEach((id) => lobby.join(id));
      playMoves(lobby, 'a', 'b', X_WINS);
      mock.timers.tick(DELAY - 1);
      mock.timers.tick(TURN); // would time out O if the timer were still running
      assert.equal(lobby.stateFor('a').timedOut, null);
    });

    it('restarts when a player leaves mid-game', () => {
      ['a', 'b', 'c'].forEach((id) => lobby.join(id));
      mock.timers.tick(TURN - 1);
      lobby.leave('a');
      assert.equal(lobby.stateFor('b').turnRemainingMs, TURN);
    });

    /** b moves somewhere, then a lets their turn run out. */
    function bMovesThenATimesOut() {
      lobby.move('b', lobby.stateFor('b').board.indexOf(null));
      mock.timers.tick(TURN);
    }

    it('removes a player who keeps timing out without moving', () => {
      lobby.join('a');
      lobby.join('b');
      mock.timers.tick(TURN); // a (X) times out first: the removal clock starts now
      const started = Date.now();
      // From here on b wins and stays X; a keeps coming back as O and timing out.
      while (Date.now() - started < KICK) {
        assert.equal(onKick.mock.callCount(), 0);
        mock.timers.tick(DELAY);
        assert.equal(lobby.stateFor('a').mark, Mark.O);
        bMovesThenATimesOut();
      }
      assert.deepEqual(onKick.mock.calls.map((call) => call.arguments[0]), ['a']);
      assert.deepEqual(lobby.playerIds, ['b']);
      assert.equal(lobby.stateFor('b').status, Status.WAITING);
    });

    it('moving resets the removal clock', () => {
      lobby.join('a');
      lobby.join('b');
      mock.timers.tick(TURN); // a (X) times out: the clock starts
      mock.timers.tick(DELAY); // b is X now, a is O
      lobby.move('b', 0);
      lobby.move('a', 4);
      assert.equal(lobby.timingOutSince.has('a'), false);
      lobby.move('b', 8);
      mock.timers.tick(KICK); // a times out again, long after the first time
      assert.equal(onKick.mock.callCount(), 0, 'the clock restarted when a moved');
      assert.equal(lobby.stateFor('a').timedOut, Mark.O);
    });
  });
});
