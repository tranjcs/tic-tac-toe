'use strict';

/**
 * Works out which address a connection came from, for per-address connection limits.
 *
 * Behind a proxy (Cloud Run), the socket's own address is the proxy's. Each trusted proxy
 * appends the address it received the request from to X-Forwarded-For, so the client is
 * `trustProxyHops` entries from the right. Entries further left were sent by the client
 * itself and can't be trusted.
 *
 * @param {{ address: string, headers: Record<string, string|string[]|undefined> }} handshake
 * @param {number} trustProxyHops - proxies in front of the server; 0 when there are none
 * @returns {string} a key for the address: an IPv4 address, or an IPv6 /64 prefix
 */
function clientIp(handshake, trustProxyHops) {
  let address = handshake.address;
  if (trustProxyHops > 0) {
    const header = handshake.headers['x-forwarded-for'];
    const forwarded = typeof header === 'string'
      ? header.split(',').map((entry) => entry.trim()).filter(Boolean)
      : [];
    if (forwarded.length >= trustProxyHops) {
      address = forwarded[forwarded.length - trustProxyHops];
    }
  }
  return addressKey(address);
}

/**
 * Normalizes an address. One IPv6 user usually holds a whole /64, so IPv6 addresses are
 * grouped by their /64 prefix; otherwise every new address would get a fresh allowance.
 * @param {string} address
 * @returns {string}
 */
function addressKey(address) {
  let ip = String(address || '').toLowerCase();
  if (ip.startsWith('::ffff:') && ip.includes('.')) return ip.slice('::ffff:'.length);
  if (!ip.includes(':')) return ip;

  ip = ip.split('%')[0]; // drop any zone index, e.g. fe80::1%eth0
  const [head, tail] = ip.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const zeros = Array(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill('0');
  const groups = tail === undefined ? headGroups : [...headGroups, ...zeros, ...tailGroups];
  return `${groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

module.exports = { clientIp, addressKey };
