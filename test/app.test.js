'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createApp } = require('../src/app');
const { parseMeasurementId } = require('../src/config');
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

  it('serves the privacy page, linked from the game page', async () => {
    const res = await fetch(`${url}/privacy.html`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Google Analytics/);
    assert.match(await (await fetch(url)).text(), /href="\/privacy.html"/);
  });

  it('serves client config with analytics off by default', async () => {
    const res = await fetch(`${url}/config.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /javascript/);
    assert.equal(await res.text(), 'window.TTT_CONFIG = {"gaMeasurementId":null};\n');
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

describe('client config', () => {
  it('serves the GA measurement ID when configured', async () => {
    const { server } = createApp({ resultDelayMs: 50, gaMeasurementId: 'G-TEST1234' });
    await new Promise((resolve) => server.listen(0, resolve));
    try {
      const res = await fetch(`http://localhost:${server.address().port}/config.js`);
      assert.match(await res.text(), /"gaMeasurementId":"G-TEST1234"/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('only accepts well-formed measurement IDs', () => {
    assert.equal(parseMeasurementId('G-ABC123XYZ'), 'G-ABC123XYZ');
    for (const bad of [undefined, '', 'UA-12345-1', 'G-abc123', 'G-1"};alert(1)//']) {
      assert.equal(parseMeasurementId(bad), null, `id=${String(bad)}`);
    }
  });
});

describe('app idle disconnect', () => {
  const IDLE_MS = 150;
  let server;
  let url;
  const sockets = [];
  const join = () => {
    const socket = connect(url, { forceNew: true, transports: ['websocket'] });
    sockets.push(socket);
    return socket;
  };

  before(async () => {
    ({ server } = createApp({ resultDelayMs: 50, idleTimeoutMs: IDLE_MS, idleCheckMs: 25 }));
    await new Promise((resolve) => server.listen(0, resolve));
    url = `http://localhost:${server.address().port}`;
  });

  after(async () => {
    sockets.forEach((s) => s.disconnect());
    await new Promise((resolve) => server.close(resolve));
  });

  it('disconnects a client that reports no activity, and keeps one that does', async () => {
    const quiet = join();
    const busy = join();
    await Promise.all([nextState(quiet), nextState(busy)]);
    const heartbeat = setInterval(() => busy.emit(Events.ACTIVE), IDLE_MS / 3);

    const reason = await new Promise((resolve) => quiet.once('disconnect', resolve));
    assert.equal(reason, 'io server disconnect', 'server-initiated, so the client does not reconnect');
    await new Promise((resolve) => setTimeout(resolve, IDLE_MS * 2));
    clearInterval(heartbeat);
    assert.equal(busy.connected, true);
  });
});

describe('app abuse limits', () => {
  let server;
  let lobby;
  let url;
  const sockets = [];
  const join = () => {
    const socket = connect(url, { forceNew: true, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    return socket;
  };

  before(async () => {
    ({ server, lobby } = createApp({ resultDelayMs: 50, maxConnectionsPerIp: 2 }));
    await new Promise((resolve) => server.listen(0, resolve));
    url = `http://localhost:${server.address().port}`;
  });

  after(async () => {
    sockets.forEach((s) => s.disconnect());
    await new Promise((resolve) => server.close(resolve));
  });

  it('refuses connections past the per-address limit, and frees the slot on disconnect', async () => {
    const a = join();
    const b = join();
    await Promise.all([nextState(a), nextState(b)]);

    const c = join();
    const err = await new Promise((resolve) => c.on('connect_error', resolve));
    assert.equal(err.message, 'too_many_connections');
    assert.equal(lobby.playerIds.length, 2);

    a.disconnect();
    await until(() => lobby.playerIds.length === 1);
    const d = join();
    await nextState(d);
    assert.equal(lobby.playerIds.length, 2);
    b.disconnect();
    d.disconnect();
    await until(() => lobby.playerIds.length === 0);
  });

  it('disconnects a client that floods messages', async () => {
    const socket = join();
    await nextState(socket);
    const disconnected = new Promise((resolve) => socket.on('disconnect', resolve));
    for (let i = 0; i < 100; i += 1) socket.emit(Events.ACTIVE);
    assert.equal(await disconnected, 'io server disconnect');
    await until(() => lobby.playerIds.length === 0);
  });

  it('drops a client that sends an oversized message', async () => {
    const socket = join();
    await nextState(socket);
    const disconnected = new Promise((resolve) => socket.on('disconnect', resolve));
    socket.emit(Events.MOVE, 'x'.repeat(10 * 1024));
    await disconnected;
    await until(() => lobby.playerIds.length === 0);
  });
});
