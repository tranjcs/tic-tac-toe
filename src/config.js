'use strict';

const DEFAULT_PORT = 3000;
const DEFAULT_RESULT_DELAY_MS = 3000;
const DEFAULT_TURN_TIMEOUT_MS = 15000;
// A little longer than the client's own 15-minute idle pause, so this only catches
// clients that don't pause themselves (old page versions, scripts).
const DEFAULT_IDLE_TIMEOUT_MS = 20 * 60 * 1000;

function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// GA4 Measurement IDs look like G-XXXXXXXXXX. Anything else turns analytics off.
const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;

function parseMeasurementId(value) {
  return typeof value === 'string' && GA_MEASUREMENT_ID_PATTERN.test(value) ? value : null;
}

module.exports = Object.freeze({
  port: parsePositiveInt(process.env.PORT, DEFAULT_PORT),
  resultDelayMs: parsePositiveInt(process.env.RESULT_DELAY_MS, DEFAULT_RESULT_DELAY_MS),
  gaMeasurementId: parseMeasurementId(process.env.GA_MEASUREMENT_ID),
  parseMeasurementId,
  turnTimeoutMs: parsePositiveInt(process.env.TURN_TIMEOUT_MS, DEFAULT_TURN_TIMEOUT_MS),
  idleTimeoutMs: parsePositiveInt(process.env.IDLE_TIMEOUT_MS, DEFAULT_IDLE_TIMEOUT_MS),
});
