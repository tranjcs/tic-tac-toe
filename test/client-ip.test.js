'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { clientIp, addressKey } = require('../src/client-ip');

const handshake = (address, forwarded) => ({
  address,
  headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded },
});

describe('clientIp', () => {
  it('uses the socket address when there is no proxy', () => {
    assert.equal(clientIp(handshake('203.0.113.7', '1.1.1.1'), 0), '203.0.113.7');
  });

  it('takes the entry the trusted proxies appended, counting from the right', () => {
    assert.equal(clientIp(handshake('10.0.0.1', '203.0.113.7'), 1), '203.0.113.7');
    assert.equal(clientIp(handshake('10.0.0.1', '1.1.1.1, 203.0.113.7'), 1), '203.0.113.7');
    assert.equal(clientIp(handshake('10.0.0.1', '1.1.1.1, 203.0.113.7, 10.0.0.2'), 2), '203.0.113.7');
  });

  it('falls back to the socket address when the header is missing or too short', () => {
    assert.equal(clientIp(handshake('10.0.0.1'), 1), '10.0.0.1');
    assert.equal(clientIp(handshake('10.0.0.1', '203.0.113.7'), 2), '10.0.0.1');
  });
});

describe('addressKey', () => {
  it('unwraps IPv4-mapped IPv6 addresses', () => {
    assert.equal(addressKey('::ffff:203.0.113.7'), '203.0.113.7');
  });

  it('groups IPv6 addresses by their /64 prefix', () => {
    const key = addressKey('2001:db8:aa:bb:1:2:3:4');
    assert.equal(key, '2001:db8:aa:bb::/64');
    assert.equal(addressKey('2001:0db8:00aa:00bb:ffff::1'), key);
    assert.equal(addressKey('2001:DB8:AA:BB::9'), key);
    assert.equal(addressKey('2001:db8::1'), '2001:db8:0:0::/64');
    assert.equal(addressKey('::1'), '0:0:0:0::/64');
  });
});
