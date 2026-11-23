'use strict';

const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');
const { Lobby } = require('./lobby');
const { Events, ConnectError } = require('./constants');
const { clientIp } = require('./client-ip');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DEFAULT_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_MAX_PLAYERS = 200;
const DEFAULT_MAX_CONNECTIONS_PER_IP = 20;
// The client only ever sends a cell index or a heartbeat; the default allows 1 MB.
const MAX_MESSAGE_BYTES = 4 * 1024;

/**
 * Creates the HTTP + Socket.IO server without starting it.
 * @param {object} options
 * @param {number} options.resultDelayMs
 * @param {string|null} [options.gaMeasurementId] - GA4 ID; analytics is off when null
 * @param {number} [options.turnTimeoutMs]
 * @param {number} [options.idleTimeoutMs] - disconnect a client that reports no activity for this long
 * @param {number} [options.idleCheckMs] - how often to look for idle clients
 * @param {number} [options.maxPlayers] - refuse new connections once this many are playing or in line
 * @param {number} [options.maxConnectionsPerIp] - refuse more connections than this from one address
 * @param {number} [options.trustProxyHops] - proxies in front of the server (see src/client-ip.js)
 * @returns {{ server: http.Server, io: Server, lobby: Lobby }}
 */
function createApp({
  resultDelayMs,
  turnTimeoutMs,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  idleCheckMs = Math.min(30 * 1000, idleTimeoutMs),
  gaMeasurementId = null,
  maxPlayers = DEFAULT_MAX_PLAYERS,
  maxConnectionsPerIp = DEFAULT_MAX_CONNECTIONS_PER_IP,
  trustProxyHops = 0,
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

  // Every player gets a state update whenever anyone joins or leaves, so the number of
  // connections has to be bounded: overall, and per address so one client can't take them all.
  /** @type {Map<string, number>} address key -> open connections from it */
  const connectionsByIp = new Map();

  io.use((socket, next) => {
    if (lobby.size >= maxPlayers) return next(new Error(ConnectError.FULL));
    const ip = clientIp(socket.handshake, trustProxyHops);
    if ((connectionsByIp.get(ip) ?? 0) >= maxConnectionsPerIp) {
      return next(new Error(ConnectError.TOO_MANY));
    }
    socket.data.ip = ip;
    return next();
  });

  io.on('connection', (socket) => {
    const { ip } = socket.data;
    connectionsByIp.set(ip, (connectionsByIp.get(ip) ?? 0) + 1);
    markActive(socket);
    lobby.join(socket.id, socket.handshake.auth?.name);
    socket.on(Events.ACTIVE, () => markActive(socket));
    socket.on(Events.MOVE, (cell) => {
      markActive(socket);
      lobby.move(socket.id, cell);
    });
    socket.on('disconnect', () => {
      const remaining = (connectionsByIp.get(ip) ?? 1) - 1;
      if (remaining > 0) connectionsByIp.set(ip, remaining);
      else connectionsByIp.delete(ip);
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
