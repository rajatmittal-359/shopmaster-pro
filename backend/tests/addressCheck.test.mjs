/**
 * The address checked before it is saved (19 Sep 2026): phone to ten digits,
 * an unknown PIN refused in words, the state taken from the PIN code, the
 * typed city kept, and India Post being down never closing checkout.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { checkAddress, cleanPhone } = require('../utils/addressCheck');

const jaipur = async (pin) => (pin === '302001' ? { pincode: pin, city: 'Jaipur', state: 'Rajasthan', areas: ['M I Road'] } : null);

describe('checkAddress', () => {
  it('phone: +91, spaces and a leading 0 all become the ten digits', () => {
    expect(cleanPhone('+91 98290 12345')).toBe('9829012345');
    expect(cleanPhone('09829012345')).toBe('9829012345');
    expect(cleanPhone('9829012345')).toBe('9829012345');
    expect(cleanPhone('12345')).toBe('12345'); // the model still refuses it - with its own message
  });

  it('fixes the state from the PIN, keeps the typed city, fills an empty city', async () => {
    const r = await checkAddress({ street: '12 MI Road', city: 'Sanganer', state: 'RJ', zipCode: '302001', phoneNumber: '+91 9829012345', landmark: ' near <b>gate</b> ' }, { lookupFn: jaipur });
    expect(r.value).toMatchObject({ city: 'Sanganer', state: 'Rajasthan', zipCode: '302001', phoneNumber: '9829012345', landmark: 'near bgate/b' });
    const empty = await checkAddress({ city: '', state: '', zipCode: '302001' }, { lookupFn: jaipur });
    expect(empty.value).toMatchObject({ city: 'Jaipur', state: 'Rajasthan' });
  });

  it('refuses a PIN India Post does not know, and a malformed one, in words', async () => {
    expect((await checkAddress({ zipCode: '999999' }, { lookupFn: jaipur })).error).toMatch(/No such PIN code \(999999\)/);
    expect((await checkAddress({ zipCode: '30200' }, { lookupFn: jaipur })).error).toMatch(/6-digit/);
    expect((await checkAddress({ zipCode: '030200' }, { lookupFn: jaipur })).error).toMatch(/6-digit/);
  });

  it('India Post down: the address goes through as typed', async () => {
    const r = await checkAddress({ city: 'Jaipur', state: 'Rajasthan', zipCode: '302001' }, { lookupFn: async () => { throw new Error('timeout'); } });
    expect(r.value).toMatchObject({ city: 'Jaipur', state: 'Rajasthan' });
  });

  it('a PATCH without a PIN code touches nothing else', async () => {
    const r = await checkAddress({ label: ' Office ' }, { lookupFn: jaipur });
    expect(r.value).toEqual({ label: 'Office' });
  });
});
