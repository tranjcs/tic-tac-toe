'use strict';

const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');
const { Lobby } = require('./lobby');
const { Events } = require('./constants');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DEFAULT_IDLE_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * Creates the HTTP + Socket.IO server without starting it.
 * @param {object} options
 * @param {number} options.resultDelayMs
 * @param {number} [options.turnTimeoutMs]
 * @param {number} [options.idleTimeoutMs] - disconnect a client that reports no activity for this long
 * @param {number} [options.idleCheckMs] - how often to look for idle clients
 * @returns {{ server: http.Server, io: Server, lobby: Lobby }}
 */
function createApp({
  resultDelayMs,
  turnTimeoutMs,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  idleCheckMs = Math.min(30 * 1000, idleTimeoutMs),
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.static(PUBLIC_DIR));

  const server = http.createServer(app);
  const io = new Server(server);

  const lobby = new Lobby({
    resultDelayMs,
    turnTimeoutMs,
    onKick: (id) => io.sockets.sockets.get(id)?.disconnect(true),
    onChange: () => {
      for (const id of lobby.playerIds) {
        io.to(id).emit(Events.STATE, lobby.stateFor(id));
      }
    },
  });

  // An open connection keeps Cloud Run running (and billed). The client pauses itself when
  // nobody is using the tab; this backstop also covers clients that don't (an old version
  // of the page that's still open, or a script). Socket.IO clients don't reconnect after
  // the server disconnects them.
  /** @type {Map<string, number>} socket id -> Date.now() of the last sign of activity */
  const lastActive = new Map();
  const markActive = (socket) => lastActive.set(socket.id, Date.now());

  const idleSweep = setInterval(() => {
    const cutoff = Date.now() - idleTimeoutMs;
    for (const [id, at] of lastActive) {
      if (at <= cutoff) io.sockets.sockets.get(id)?.disconnect(true);
    }
  }, idleCheckMs);
  idleSweep.unref();

  io.on('connection', (socket) => {
    markActive(socket);
    lobby.join(socket.id, socket.handshake.auth?.name);
    socket.on(Events.ACTIVE, () => markActive(socket));
    socket.on(Events.MOVE, (cell) => {
      markActive(socket);
      lobby.move(socket.id, cell);
    });
    socket.on('disconnect', () => {
      lastActive.delete(socket.id);
      lobby.leave(socket.id);
    });
  });

  server.on('close', () => {
    clearInterval(idleSweep);
    lobby.dispose();
  });

  return { server, io, lobby };
}

module.exports = { createApp };
