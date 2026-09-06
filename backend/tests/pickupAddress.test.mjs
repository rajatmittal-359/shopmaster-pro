/**
 * Knowing where to collect a parcel FROM.
 *
 * THE BUG THIS DEFENDS AGAINST
 *   Booking read one pickup address out of the environment - the platform
 *   shop's - and used it for every seller. With one shop that is correct by
 *   accident. With a second seller it silently sends a courier to the
 *   PLATFORM's door for a parcel sitting in somebody else's shop: the fee is
 *   charged, the rider finds nothing, and nothing errors anywhere because the
 *   booking itself succeeded.
 *
 *   The same address is also the destination a RETURN comes back to, and the
 *   pincode freight is quoted from - so a Mumbai seller would have their
 *   customer charged Jaipur rates.
 *
 * Refusing is the point. A fallback here costs a wasted pickup and a customer
 * waiting on a parcel nobody collected; refusing costs a message to somebody
 * who can fix it in a minute.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { pickupAddressFor } = require('../utils/deliveryTruth');

const FULL = {
  contactName: 'Rajat Mittal',
  address1: 'C-13, Hari Marg, Devi Nagar',
  city: 'Jaipur',
  state: 'Rajasthan',
  pincode: '302019',
  phone: '8769766908',
};

describe('the platform shop', () => {
  /**
   * Exempt because SHIPROCKET_PICKUP_LOCATION *is* its address - the shipments
   * are booked on its own Shiprocket account.
   */
  it('ships without needing its address repeated', () => {
    expect(pickupAddressFor({ isPlatformOwned: true }).ok).toBe(true);
  });

  it('ships even with an empty pickupAddress', () => {
    expect(pickupAddressFor({ isPlatformOwned: true, pickupAddress: {} }).ok).toBe(true);
  });
});

describe('any other seller', () => {
  it('may ship once we know where to collect from', () => {
    const result = pickupAddressFor({ isPlatformOwned: false, pickupAddress: FULL });

    expect(result.ok).toBe(true);
    expect(result.address.pincode).toBe('302019');
  });

  it('is refused with no address at all', () => {
    const result = pickupAddressFor({ isPlatformOwned: false });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/pickup address/i);
  });

  /**
   * Each of these alone makes a booking useless: no street and the rider has
   * nowhere to go, no pincode and no courier can be priced, no phone and
   * nobody can be called when they cannot find it.
   */
  it.each([['address1'], ['pincode'], ['phone']])(
    'is refused when %s is missing',
    (field) => {
      const partial = { ...FULL };
      delete partial[field];

      expect(pickupAddressFor({ isPlatformOwned: false, pickupAddress: partial }).ok).toBe(
        false
      );
    }
  );

  it('says what to do, not just that something is wrong', () => {
    const { reason } = pickupAddressFor({ isPlatformOwned: false });

    expect(reason).toMatch(/add your pickup address/i);
    // And why it matters, because "required field" teaches nobody anything.
    expect(reason).toMatch(/charged|wrong place/i);
  });
});

describe('no seller profile at all', () => {
  it('refuses rather than falling back to the platform address', () => {
    expect(pickupAddressFor(null).ok).toBe(false);
    expect(pickupAddressFor(undefined).ok).toBe(false);
  });
});
