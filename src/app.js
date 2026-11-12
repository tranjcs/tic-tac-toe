'use strict';

const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');
const { Lobby } = require('./lobby');
const { Events, ErrorCodes } = require('./constants');
const { clientKey, ConnectionLimiter, createRateLimiter } = require('./limits');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DEFAULT_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_MAX_CONNECTIONS_PER_IP = 10;
// Every message the client sends is tiny (a cell index, a heartbeat, a name).
const MAX_MESSAGE_BYTES = 2 * 1024;
// A person clicks a few times a second at most and reports activity once a minute.
const MESSAGE_BURST = 20;
const MESSAGES_PER_SECOND = 5;

/**
 * Creates the HTTP + Socket.IO server without starting it.
 * @param {object} options
 * @param {number} options.resultDelayMs
 * @param {string|null} [options.gaMeasurementId] - GA4 ID; analytics is off when null
 * @param {number} [options.turnTimeoutMs]
 * @param {number} [options.idleTimeoutMs] - disconnect a client that reports no activity for this long
 * @param {number} [options.idleCheckMs] - how often to look for idle clients
 * @param {number} [options.maxConnectionsPerIp] - refuse connections past this many per client address
 * @param {boolean} [options.trustProxy] - take the client address from X-Forwarded-For (Cloud Run)
 * @returns {{ server: http.Server, io: Server, lobby: Lobby }}
 */
function createApp({
  resultDelayMs,
  turnTimeoutMs,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  idleCheckMs = Math.min(30 * 1000, idleTimeoutMs),
  gaMeasurementId = null,
  maxConnectionsPerIp = DEFAULT_MAX_CONNECTIONS_PER_IP,
  trustProxy = false,
}) {
  const app = express();
  app.disable('x-powered-by');

  // Runtime settings for the browser (public/js/analytics.js reads them).
  const clientConfig = `window.TTT_CONFIG = ${JSON.stringify({ gaMeasurementId })};\n`;
  app.get('/config.js', (req, res) => {
    res.type('text/javascript').set('Cache-Control', 'no-cache').send(clientConfig);
  });
  app.use(express.static(PUBLIC_DIR));

  const server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: MAX_MESSAGE_BYTES });

  // One address can't fill the line (or keep the server running) with many connections.
  // Socket.IO clients don't retry after a middleware error; the page tells the player why.
  const connections = new ConnectionLimiter(maxConnectionsPerIp);
  io.use((socket, next) => {
    const key = clientKey(socket.handshake, trustProxy);
    if (!connections.acquire(key)) {
      next(new Error(ErrorCodes.TOO_MANY_CONNECTIONS));
      return;
    }
    socket.data.limitKey = key;
    next();
  });

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
    // A client flooding messages is a script, not a person: drop it.
    const allowMessage = createRateLimiter({ burst: MESSAGE_BURST, perSecond: MESSAGES_PER_SECOND });
    socket.use((_packet, next) => {
      if (allowMessage()) next();
      else socket.disconnect(true);
    });
    socket.on(Events.ACTIVE, () => markActive(socket));
    socket.on(Events.MOVE, (cell) => {
      markActive(socket);
      lobby.move(socket.id, cell);
    });
    socket.on('disconnect', () => {
      connections.release(socket.data.limitKey);
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
