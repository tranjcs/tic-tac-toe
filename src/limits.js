'use strict';

const net = require('node:net');

/**
 * The address to count a connection against.
 *
 * With `trustProxy` (Cloud Run), the client is the last X-Forwarded-For entry: Cloud Run
 * appends the address it saw, and anything before it came from the client and can be
 * forged. Without it, the TCP peer address is used and X-Forwarded-For is ignored.
 * IPv6 addresses are grouped by their /64, which one subscriber usually gets whole.
 * @param {{ address: string, headers: object }} handshake - Socket.IO handshake
 * @param {boolean} trustProxy
 * @returns {string}
 */
function clientKey(handshake, trustProxy) {
  let ip = handshake.address || '';
  if (trustProxy) {
    const forwarded = handshake.headers?.['x-forwarded-for'];
    const last = typeof forwarded === 'string' ? forwarded.split(',').pop().trim() : '';
    if (last) ip = last;
  }
  return normalizeIp(ip);
}

function normalizeIp(ip) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  if (!net.isIPv6(ip)) return ip;
  return `${expandIpv6(ip).slice(0, 4).join(':')}::/64`;
}

/** @returns {string[]} the eight hextets of an IPv6 address */
function expandIpv6(ip) {
  const [head, tail] = ip.split('%')[0].split('::');
  const parts = (s) => (s ? s.split(':') : []);
  const left = parts(head);
  const right = tail === undefined ? [] : parts(tail);
  const zeros = Array(8 - left.length - right.length).fill('0');
  return [...left, ...zeros, ...right].map((h) => h.toLowerCase().replace(/^0+(?=.)/, ''));
}

/** Counts open connections per key and refuses new ones past `max`. */
class ConnectionLimiter {
  constructor(max) {
    this.max = max;
    /** @type {Map<string, number>} */
    this.counts = new Map();
  }

  /** @returns {boolean} whether the connection was admitted (and counted) */
  acquire(key) {
    const count = this.counts.get(key) ?? 0;
    if (count >= this.max) return false;
    this.counts.set(key, count + 1);
    return true;
  }

  release(key) {
    const count = (this.counts.get(key) ?? 0) - 1;
    if (count > 0) this.counts.set(key, count);
    else this.counts.delete(key);
  }
}

/**
 * Token bucket: allows bursts of `burst` messages, refilled at `perSecond`.
 * @param {{ burst: number, perSecond: number, now?: () => number }} options
 * @returns {() => boolean} call once per message; false once the client is over the limit
 */
function createRateLimiter({ burst, perSecond, now = Date.now }) {
  let tokens = burst;
  let last = now();
  return () => {
    const t = now();
    tokens = Math.min(burst, tokens + ((t - last) / 1000) * perSecond);
    last = t;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

module.exports = { clientKey, normalizeIp, ConnectionLimiter, createRateLimiter };
