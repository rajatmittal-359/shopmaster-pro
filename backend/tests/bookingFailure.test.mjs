/**
 * A courier that would not take the parcel.
 *
 * THE BUG THIS DEFENDS AGAINST
 *   A failed booking lived in a toast. The seller pressed Ship, saw a red
 *   message, and that was the whole record of it - nothing was written down, so
 *   nothing could chase it. The order sat in 'processing' looking exactly like
 *   one nobody had got round to yet, the customer's page went on saying "being
 *   prepared by the seller", and the only person who knew had closed the tab.
 *
 *   That is precisely the shape of a flat Shiprocket wallet. They refuse to
 *   create an order below a RS 100 balance, so bookings stop dead at a moment
 *   nobody is watching, and from inside the shop it looks like a customer who
 *   paid and a parcel nobody packed.
 *
 * The rules being defended:
 *   1. the courier's own words are kept, verbatim, for the record
 *   2. a plain sentence about what to DO is derived from them, and never guessed
 *   3. a wallet failure is recognised however they word it
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { classifyBookingFailure } = require('../utils/bookingFailure');

describe('reading why a booking failed', () => {
  /**
   * The real message, from a Shiprocket account that had run dry. Their wording
   * moves around; "recharge" and "wallet" are what stay.
   */
  it.each([
    'Please recharge your Shiprocket wallet. The minimum recharge balance is Rs 100',
    'Insufficient balance in your account',
    'Low balance. Please recharge to continue',
    'WALLET BALANCE IS LOW',
  ])('knows an empty wallet from %s', (message) => {
    expect(classifyBookingFailure(message).kind).toBe('wallet');
  });

  it('tells the reader the wallet is the problem, not the parcel', () => {
    const { advice } = classifyBookingFailure('Please recharge your Shiprocket wallet');

    expect(advice).toMatch(/wallet/i);
    // The point of the sentence: this parcel is fine, and no other parcel will
    // go either until somebody tops it up.
    expect(advice).toMatch(/any other parcel|topping up/i);
  });

  it.each([
    ['Given courier not serviceable', 'serviceability'],
    ['No courier available for this pincode', 'serviceability'],
    ['The shipping phone number is invalid', 'address'],
    ['Package weight is required', 'weight'],
    ['Order already exists with this order id', 'duplicate'],
  ])('reads %s as %s', (message, kind) => {
    expect(classifyBookingFailure(message).kind).toBe(kind);
  });

  /**
   * No invented advice. A guess sends somebody to check the wrong thing, and
   * the courier's own words are shown next to this anyway.
   */
  it('admits when it does not recognise the reason', () => {
    const { kind, advice } = classifyBookingFailure('E_UNKNOWN_42');

    expect(kind).toBe('other');
    expect(advice).toMatch(/refused/i);
    expect(advice).not.toMatch(/wallet|pincode|weight/i);
  });

  it('does not fall over on nothing at all', () => {
    expect(classifyBookingFailure(undefined).kind).toBe('other');
    expect(classifyBookingFailure('').kind).toBe('other');
  });

  /*
   * THE SECOND WALLET (12 Oct 2026)
   *
   * Same-day goes by Borzo, everything else by Shiprocket, and they are two
   * separate prepaid accounts on two separate dashboards. Borzo's documented
   * refusal is `insufficient_balance`, which the wallet rule above already
   * matches on "insufficient" - so the kind was right and the SENTENCE was
   * wrong: it named Shiprocket, and sent whoever read it to top up an account
   * that was never the problem while the one that was stayed empty.
   *
   * There is no pre-flight check that could have caught this first. Borzo's
   * API 1.8 has no balance to read - their own docs describe GET /client as
   * "client info with allowed payment methods" and the live account returns
   * exactly that, with ₹100 in the wallet and no amount anywhere in the
   * payload. So the booking failure IS the only signal, and it has to name
   * the right courier.
   */
  it('sends a Borzo wallet failure to Borzo, not to Shiprocket', () => {
    const { kind, advice } = classifyBookingFailure('insufficient_balance', 'borzo');

    expect(kind).toBe('wallet');
    expect(advice).toMatch(/borzo/i);
    expect(advice).not.toMatch(/shiprocket/i);
  });

  it('still sends a Shiprocket wallet failure to Shiprocket', () => {
    const { advice } = classifyBookingFailure('Please recharge your wallet', 'shiprocket');

    expect(advice).toMatch(/shiprocket/i);
    expect(advice).not.toMatch(/borzo/i);
  });

  /** Old callers pass one argument; they must keep working. */
  it('names no courier when it was not told which one refused', () => {
    const { kind, advice } = classifyBookingFailure('Insufficient balance in your account');

    expect(kind).toBe('wallet');
    expect(advice).toMatch(/wallet/i);
    expect(advice).not.toMatch(/borzo|shiprocket/i);
  });
});
