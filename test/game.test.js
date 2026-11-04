const test = require('node:test');
const assert = require('node:assert');
const { io } = require('socket.io-client');
const { createServer } = require('../server');

function nextState(sock, pred = () => true) {
  return new Promise((resolve) => {
    const h = (s) => { if (pred(s)) { sock.off('state', h); resolve(s); } };
    sock.on('state', h);
  });
}

test('waiting, playing, in line, win and disconnect', async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  const connect = () => io(url, { forceNew: true });

  const a = connect();
  assert.strictEqual((await nextState(a)).status, 'waiting');

  const aPlaying = nextState(a, (s) => s.status === 'playing');
  const b = connect();
  const bs = await nextState(b, (s) => s.status === 'playing');
  const as = await aPlaying;
  assert.strictEqual(as.symbol, 'X');
  assert.strictEqual(bs.symbol, 'O');

  const c = connect();
  const cs = await nextState(c);
  assert.strictEqual(cs.status, 'in-line');
  assert.strictEqual(cs.position, 1);

  // O tries to move out of turn: ignored. X wins with top row.
  const moves = [[a, 0], [b, 3], [a, 1], [b, 4], [a, 2]];
  for (const [sock, cell] of moves) {
    const p = nextState(a, (s) => s.board && s.board[cell]);
    sock.emit('move', cell);
    await p;
  }
  const result = await nextState(c, (s) => s.result);
  assert.strictEqual(result.result, 'X');

  // After the delay, loser (b) goes to back; c plays a.
  const cPlay = await nextState(c, (s) => s.status === 'playing');
  assert.strictEqual(cPlay.symbol, 'O');
  const bLine = await nextState(b, (s) => s.status === 'in-line');
  assert.strictEqual(bLine.position, 1);

  // a disconnects mid-game: b steps in.
  const bPlay = nextState(b, (s) => s.status === 'playing');
  a.disconnect();
  await bPlay;

  b.disconnect(); c.disconnect();
  io.close?.();
  await new Promise((r) => server.close(r));
});
