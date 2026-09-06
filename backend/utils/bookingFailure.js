/**
 * Why a courier could not be booked, in words the seller can act on.
 *
 * WHY THIS EXISTS
 *   A failed booking lived in a toast. The seller pressed Ship, saw a red
 *   message, and that was the entire record of it - nothing was written down,
 *   so nothing could chase it. The order sat in 'processing' looking exactly
 *   like one nobody had got round to yet, the customer's page went on saying
 *   "Being prepared by the seller", and the only person who knew had already
 *   closed the tab.
 *
 *   That is the shape of the wallet problem in particular. Shiprocket refuses
 *   to create an order below a RS 100 balance, so bookings stop dead at a
 *   moment nobody is watching - and from inside the shop it looks like a
 *   customer who paid and a parcel that was never packed.
 *
 * WHY THE REASONS ARE CLASSIFIED
 *   "Please recharge your Shiprocket wallet" is Shiprocket talking to their
 *   account holder, not to a seller on our platform - and on a marketplace the
 *   seller is very often not the person who can recharge it. So the courier's
 *   words are kept verbatim for the record, and a plain sentence about what to
 *   do next is put in front of whoever is looking.
 */

/**
 * Their wording moves around; the meaning does not. Ordered most specific
 * first, because a message can match more than one of these.
 */
const KINDS = [
  {
    kind: 'wallet',
    test: /recharge|insufficient|low balance|wallet/i,
    say: 'The Shiprocket wallet is out of money, so no courier can be booked. It needs topping up before this or any other parcel can go.',
  },
  {
    kind: 'serviceability',
    test: /not serviceable|no courier|not available|pincode|servicable/i,
    say: 'No courier will carry this parcel to that PIN code. Try again later, or contact the customer about a different address.',
  },
  {
    kind: 'address',
    test: /address|phone|pincode is required|invalid.*(name|email)/i,
    say: 'The delivery details were refused. Check the address and phone number on this order.',
  },
  {
    kind: 'weight',
    test: /weight|dimension|length|breadth|height/i,
    say: 'The parcel weight or size was refused. Check the product weights on the items in this order.',
  },
  {
    kind: 'duplicate',
    test: /already|duplicate|exists/i,
    say: 'The courier already has a shipment under this reference. Check the Shiprocket panel before trying again.',
  },
];

/**
 * @param {string} reason  whatever the courier said
 * @returns {{kind: string, advice: string}}
 */
const classifyBookingFailure = (reason) => {
  const text = String(reason || '');

  const hit = KINDS.find((k) => k.test.test(text));
  if (hit) return { kind: hit.kind, advice: hit.say };

  return {
    kind: 'other',
    // No invented advice. A guess here sends somebody to check the wrong thing,
    // and the courier's own words are already shown beside this.
    advice: 'The courier refused this booking. Their reason is above.',
  };
};

module.exports = { classifyBookingFailure, KINDS };
