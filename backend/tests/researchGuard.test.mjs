/**
 * The guard in front of "the server fetches a URL somebody typed" (24 Sep 2026).
 *
 * The import feature hands the server an address chosen by a seller. Without
 * this, that is a door into everything the server can reach and the internet
 * cannot: the database on localhost, the cloud's metadata service on
 * 169.254.169.254, the neighbours on the private network. Server-side request
 * forgery is the whole risk of the feature, so the check is on the RESOLVED
 * address, not on how the name looks.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const dns = require('dns').promises;
const { safeUrl, isPublic } = require('../utils/research/guard');

const resolvesTo = (...addresses) =>
  vi.spyOn(dns, 'lookup').mockResolvedValue(addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));

afterEach(() => vi.restoreAllMocks());

describe('which addresses the server may be sent to', () => {
  it('lets a public one through', async () => {
    resolvesTo('142.250.183.4');
    expect((await safeUrl('https://www.meesho.com/x/p/1')).hostname).toBe('www.meesho.com');
  });

  it('refuses the machine it is running on, the private network and the cloud metadata service', async () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.4.4', '192.168.1.9', '169.254.169.254', '::1']) {
      resolvesTo(ip);
      await expect(safeUrl('https://sneaky.example/x')).rejects.toThrow(/public internet/i);
    }
  });

  it('refuses a name that resolves to one public and one private address', async () => {
    // The one we did not check is the one that matters.
    resolvesTo('142.250.183.4', '127.0.0.1');
    await expect(safeUrl('https://both.example/x')).rejects.toThrow(/public internet/i);
  });

  it('takes only http and https, and no credentials in the link', async () => {
    await expect(safeUrl('file:///etc/passwd')).rejects.toThrow(/http and https/i);
    await expect(safeUrl('gopher://example.com/x')).rejects.toThrow(/http and https/i);
    resolvesTo('142.250.183.4');
    await expect(safeUrl('https://user:pass@example.com/x')).rejects.toThrow(/username or password/i);
  });

  it('answers a seller in words, not in jargon, when the link is nonsense', async () => {
    await expect(safeUrl('not a link')).rejects.toThrow(/whole link/i);
  });

  it('knows a private address from a public one', () => {
    expect(isPublic('8.8.8.8')).toBe(true);
    expect(isPublic('100.64.0.1')).toBe(false); // carrier-grade NAT
    expect(isPublic('::ffff:127.0.0.1')).toBe(false);
  });
});
