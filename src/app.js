'use strict';

const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');
const { Lobby } = require('./lobby');
const { Events } = require('./constants');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/**
 * Creates the HTTP + Socket.IO server without starting it.
 * @param {object} options
 * @param {number} options.resultDelayMs
 * @returns {{ server: http.Server, io: Server, lobby: Lobby }}
 */
function createApp({ resultDelayMs }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.static(PUBLIC_DIR));

  const server = http.createServer(app);
  const io = new Server(server);

  const lobby = new Lobby({
    resultDelayMs,
    onChange: () => {
      for (const id of lobby.playerIds) {
        io.to(id).emit(Events.STATE, lobby.stateFor(id));
      }
    },
  });

  io.on('connection', (socket) => {
    lobby.join(socket.id, socket.handshake.auth?.name);
    socket.on(Events.MOVE, (cell) => lobby.move(socket.id, cell));
    socket.on('disconnect', () => lobby.leave(socket.id));
  });

  server.on('close', () => lobby.dispose());

  return { server, io, lobby };
}

module.exports = { createApp };
