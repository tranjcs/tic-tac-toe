'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createApp } = require('../src/app');
const { Events, Status, Mark } = require('../src/constants');

/** Resolves with the next state event matching `predicate`. */
function nextState(socket, predicate = () => true) {
  return new Promise((resolve) => {
    const handler = (state) => {
      if (predicate(state)) {
        socket.off(Events.STATE, handler);
        resolve(state);
      }
    };
    socket.on(Events.STATE, handler);
  });
}

/** Polls until `condition` is true; the server handles disconnects asynchronously. */
async function until(condition, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('app (Socket.IO integration)', () => {
  let server;
  let lobby;
  let url;
  const sockets = [];
  const join = () => {
    const socket = connect(url, { forceNew: true, transports: ['websocket'] });
    sockets.push(socket);
    return socket;
  };

  before(async () => {
    ({ server, lobby } = createApp({ resultDelayMs: 50 }));
    await new Promise((resolve) => server.listen(0, resolve));
    url = `http://localhost:${server.address().port}`;
  });

  after(async () => {
    sockets.forEach((s) => s.disconnect());
    await new Promise((resolve) => server.close(resolve));
  });

  it('serves the client page', async () => {
    const res = await fetch(url);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<title>Tic-Tac-Toe<\/title>/);
  });

  it('assigns names and lets a reconnecting client keep its name', async () => {
    const first = join();
    const { name } = await nextState(first);
    assert.match(name, /^Player \d+$/);
    first.disconnect();
    await until(() => lobby.playerIds.length === 0);

    const again = connect(url, { forceNew: true, transports: ['websocket'], auth: { name } });
    sockets.push(again);
    assert.equal((await nextState(again)).name, name);
    again.disconnect();
    await until(() => lobby.playerIds.length === 0);
  });

  it('runs waiting → playing → in line → rotation → disconnect', async () => {
    const a = join();
    assert.equal((await nextState(a)).status, Status.WAITING);

    const aPlaying = nextState(a, (s) => s.status === Status.PLAYING);
    const b = join();
    assert.equal((await nextState(b, (s) => s.status === Status.PLAYING)).mark, Mark.O);
    assert.equal((await aPlaying).mark, Mark.X);

    const c = join();
    assert.deepEqual(
      (({ status, position }) => ({ status, position }))(await nextState(c)),
      { status: Status.IN_LINE, position: 1 },
    );

    // X wins along the top row; spectators see every move.
    const moves = [[a, 0], [b, 3], [a, 1], [b, 4], [a, 2]];
    for (const [socket, cell] of moves) {
      const seen = nextState(c, (s) => s.board && s.board[cell] !== null);
      socket.emit(Events.MOVE, cell);
      await seen;
    }

    // Loser (b) goes to the back; c steps up as O.
    const cPlaying = nextState(c, (s) => s.status === Status.PLAYING);
    const bInLine = nextState(b, (s) => s.status === Status.IN_LINE);
    assert.equal((await cPlaying).mark, Mark.O);
    assert.equal((await bInLine).position, 1);

    // a disconnects mid-game: b steps in.
    const bPlaying = nextState(b, (s) => s.status === Status.PLAYING);
    a.disconnect();
    await bPlaying;
  });
});
