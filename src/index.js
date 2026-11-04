'use strict';

const config = require('./config');
const { createApp } = require('./app');

const { server, io } = createApp({
  resultDelayMs: config.resultDelayMs,
  turnTimeoutMs: config.turnTimeoutMs,
  idleTimeoutMs: config.idleTimeoutMs,
});

server.listen(config.port, () => {
  console.log(`Tic-tac-toe running on http://localhost:${config.port}`);
});

const SHUTDOWN_TIMEOUT_MS = 5000;

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  // Force exit if open connections keep the server from closing in time.
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  io.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
