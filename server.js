const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const RESULT_DELAY_MS = 3000;

function winnerOf(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every(Boolean) ? 'draw' : null;
}

function createServer() {
  const app = express();
  app.use(express.static(path.join(__dirname, 'public')));
  const server = http.createServer(app);
  const io = new Server(server);

  // Everyone connected, in arrival order. The first two play; the rest are in line.
  let queue = [];
  let game = null; // { players: [xId, oId], board, turn: 'X'|'O', result, timer }

  function symbolOf(id) {
    if (!game) return null;
    const i = game.players.indexOf(id);
    return i === -1 ? null : (i === 0 ? 'X' : 'O');
  }

  function sendState() {
    queue.forEach((id, index) => {
      const sock = io.sockets.sockets.get(id);
      if (!sock) return;
      const state = { queueLength: queue.length };
      const symbol = symbolOf(id);
      if (symbol) {
        state.status = 'playing';
        state.symbol = symbol;
      } else if (!game) {
        state.status = 'waiting';
      } else {
        state.status = 'in-line';
        state.position = index - 1; // 1 = next up
      }
      if (game) {
        state.board = game.board;
        state.turn = game.turn;
        state.result = game.result;
      }
      sock.emit('state', state);
    });
  }

  function startGameIfPossible() {
    if (!game && queue.length >= 2) {
      game = {
        players: [queue[0], queue[1]],
        board: Array(9).fill(null),
        turn: 'X',
        result: null,
        timer: null,
      };
    }
    sendState();
  }

  function finishGame(result) {
    game.result = result;
    sendState();
    const finished = game;
    finished.timer = setTimeout(() => {
      if (game !== finished) return;
      // Winner stays on; loser goes to the back of the line. On a draw both rotate out.
      const [x, o] = finished.players;
      const leaving = result === 'X' ? [o] : result === 'O' ? [x] : [x, o];
      queue = queue.filter((id) => !leaving.includes(id)).concat(leaving.filter((id) => queue.includes(id)));
      game = null;
      startGameIfPossible();
    }, RESULT_DELAY_MS);
  }

  io.on('connection', (socket) => {
    queue.push(socket.id);
    startGameIfPossible();

    socket.on('move', (cell) => {
      if (!game || game.result) return;
      const symbol = symbolOf(socket.id);
      if (!symbol || symbol !== game.turn) return;
      if (!Number.isInteger(cell) || cell < 0 || cell > 8 || game.board[cell]) return;
      game.board[cell] = symbol;
      game.turn = symbol === 'X' ? 'O' : 'X';
      const result = winnerOf(game.board);
      if (result) finishGame(result);
      else sendState();
    });

    socket.on('disconnect', () => {
      queue = queue.filter((id) => id !== socket.id);
      if (game && game.players.includes(socket.id)) {
        // Remaining player stays at the front; the next in line steps up immediately.
        clearTimeout(game.timer);
        game = null;
      }
      startGameIfPossible();
    });
  });

  return server;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createServer().listen(port, () => console.log(`Tic-tac-toe running on http://localhost:${port}`));
}

module.exports = { createServer, winnerOf };
