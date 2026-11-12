'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { clientKey, normalizeIp, ConnectionLimiter, createRateLimiter } = require('../src/limits');

describe('clientKey', () => {
  const handshake = { address: '10.0.0.1', headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } };

  it('ignores X-Forwarded-For unless the proxy is trusted', () => {
    assert.equal(clientKey(handshake, false), '10.0.0.1');
  });

  it('takes the last X-Forwarded-For entry, which the client cannot forge', () => {
    assert.equal(clientKey(handshake, true), '5.6.7.8');
  });

  it('falls back to the peer address without the header', () => {
    assert.equal(clientKey({ address: '10.0.0.1', headers: {} }, true), '10.0.0.1');
  });
});

describe('normalizeIp', () => {
  it('unwraps IPv4-mapped IPv6 addresses', () => {
    assert.equal(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1');
  });

  it('groups IPv6 addresses by /64', () => {
    assert.equal(normalizeIp('2001:db8:1:2::1'), '2001:db8:1:2::/64');
    assert.equal(normalizeIp('2001:0DB8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
    assert.equal(normalizeIp('2001:db8::'), '2001:db8:0:0::/64');
    assert.equal(normalizeIp('::1'), '0:0:0:0::/64');
  });
});

describe('ConnectionLimiter', () => {
  it('admits up to the limit per key and frees slots on release', () => {
    const limiter = new ConnectionLimiter(2);
    assert.ok(limiter.acquire('a'));
    assert.ok(limiter.acquire('a'));
    assert.ok(!limiter.acquire('a'));
    assert.ok(limiter.acquire('b'));
    limiter.release('a');
    assert.ok(limiter.acquire('a'));
    limiter.release('a');
    limiter.release('a');
    limiter.release('b');
    assert.equal(limiter.counts.size, 0);
  });
});

describe('createRateLimiter', () => {
  it('allows a burst, then refills over time', () => {
    let now = 0;
    const allow = createRateLimiter({ burst: 3, perSecond: 2, now: () => now });
    assert.deepEqual([allow(), allow(), allow(), allow()], [true, true, true, false]);
    now += 500; // one token back
    assert.deepEqual([allow(), allow()], [true, false]);
    now += 60 * 1000; // capped at the burst size
    assert.deepEqual([allow(), allow(), allow(), allow()], [true, true, true, false]);
  });
});
