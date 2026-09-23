const dns = require('dns').promises;
const net = require('net');

/**
 * Before the server fetches a URL somebody typed (24 Sep 2026).
 *
 * The moment a seller can hand us an address and we go and get it, the server
 * becomes a proxy into everything it can reach that the internet cannot: the
 * database on localhost, the metadata service every cloud host answers on
 * 169.254.169.254, the neighbours on the private network. That is SSRF, and it
 * is the whole risk of this feature.
 *
 * So: http(s) only, no credentials in the URL, no port games, and every
 * address the name resolves to has to be a public one - checked here, not
 * trusted from the string. A name that resolves to several addresses is
 * refused unless ALL of them are public, because the one we did not check is
 * the one that matters.
 */
const PRIVATE_V4 = [
  [10, 0, 0, 0, 8],
  [127, 0, 0, 0, 8],
  [169, 254, 0, 0, 16],
  [172, 16, 0, 0, 12],
  [192, 168, 0, 0, 16],
  [100, 64, 0, 0, 10], // carrier-grade NAT
  [192, 0, 0, 0, 24],
  [0, 0, 0, 0, 8],
];

const inBlock = (ip, [a, b, c, d, bits]) => {
  const toInt = (parts) => parts.reduce((n, p) => (n << 8) + p, 0) >>> 0;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (toInt(ip.split('.').map(Number)) & mask) === (toInt([a, b, c, d]) & mask);
};

const isPublic = (addr) => {
  if (net.isIPv4(addr)) return !PRIVATE_V4.some((block) => inBlock(addr, block));
  if (net.isIPv6(addr)) {
    const a = addr.toLowerCase();
    // loopback, link-local, unique-local, and v4-mapped private space
    if (a === '::1' || a.startsWith('fe80') || a.startsWith('fc') || a.startsWith('fd')) return false;
    if (a.startsWith('::ffff:')) return isPublic(a.slice(7));
    return true;
  }
  return false;
};

/**
 * @param {string} raw whatever the person pasted
 * @returns {Promise<URL>} the parsed URL, safe to fetch
 * @throws {Error} with a sentence the seller can read
 */
const safeUrl = async (raw) => {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new Error('That is not a web address. Paste the whole link, starting with https://');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http and https links can be read.');
  if (url.username || url.password) throw new Error('A link with a username or password in it cannot be read.');

  let addresses = [];
  try {
    addresses = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw new Error('That address does not exist, or the site is not answering.');
  }
  if (!addresses.length || !addresses.every((a) => isPublic(a.address))) {
    throw new Error('That address is not on the public internet.');
  }
  return url;
};

module.exports = { safeUrl, isPublic };
