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
    /*
     * THE COURIER HAS TO BE NAMED (12 Oct 2026)
     *
     * This sentence used to say "Shiprocket" whatever had refused. Same-day
     * goes by Borzo and everything else by Shiprocket: two prepaid accounts,
     * two dashboards. Borzo's documented refusal is `insufficient_balance`,
     * which matches the rule above - so the kind was right and the sentence
     * sent the reader to top up the account that was never the problem.
     *
     * Nothing upstream can catch this earlier. Borzo's API 1.8 has no balance
     * to read: their docs describe GET /client as "client info with allowed
     * payment methods", and the live account returns exactly that - name,
     * phone, email, legal type, methods - with money in the wallet and no
     * amount anywhere. The refusal at booking time is the only signal there
     * is, so it has to point at the right door.
     */
    say: (courier) =>
      `The ${courier ? `${courier} ` : ''}wallet is out of money, so no courier can be booked. It needs topping up before this or any other parcel can go.`,
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

/** `shippingProvider` as the order stores it, in the words a person reads. */
const COURIER_NAMES = { borzo: 'Borzo', shiprocket: 'Shiprocket' };

/**
 * @param {string} reason      whatever the courier said
 * @param {string} [provider]  which courier refused ('borzo' | 'shiprocket').
 *                             Omitted means unknown, and then no courier is
 *                             named - a guess here sends somebody to the wrong
 *                             dashboard, which is the bug this argument fixes.
 * @returns {{kind: string, advice: string}}
 */
const classifyBookingFailure = (reason, provider) => {
  const text = String(reason || '');
  const courier = COURIER_NAMES[String(provider || '').toLowerCase()] || '';

  const hit = KINDS.find((k) => k.test.test(text));
  if (hit) return { kind: hit.kind, advice: typeof hit.say === 'function' ? hit.say(courier) : hit.say };

  return {
    kind: 'other',
    // No invented advice. A guess here sends somebody to check the wrong thing,
    // and the courier's own words are already shown beside this.
    advice: 'The courier refused this booking. Their reason is above.',
  };
};

module.exports = { classifyBookingFailure, KINDS };
