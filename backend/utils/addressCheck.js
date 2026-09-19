const { lookup } = require('./pincode');

/**
 * The address, checked before it is saved (19 Sep 2026).
 *
 * WHY
 *   A wrong address is the NDR/RTO the rulebook then charges the seller for,
 *   the customer's week lost, and the courier's fee gone - three losers for
 *   one typo. Amazon, Flipkart and Meesho all take the PIN code first and
 *   fill the rest from it; Baymard puts the address form second among the
 *   places checkouts are abandoned. The browser form does the same with
 *   /api/pincode/:code; this is the server's copy of the check, because a
 *   form can be skipped and an API cannot.
 *
 * WHAT IT DOES
 *   - the phone becomes ten digits (a pasted +91 98290 12345 is fine);
 *   - a PIN code India Post does not know is refused in words;
 *   - the STATE is taken from the PIN code when the two disagree - state is
 *     what a courier booking and a GST place-of-supply read, and "Rajasthan"
 *     typed as "RJ" or "Jaipur" breaks both; the typed city is kept (a person
 *     knows Sanganer better than the district table does), filled from the
 *     PIN only when empty;
 *   - India Post unreachable: the address goes through as typed - a dead
 *     upstream must not close checkout.
 */
const digits = (v) => String(v || '').replace(/\D/g, '');

const cleanPhone = (raw) => {
  let d = digits(raw);
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
};

const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * @returns {Promise<{value: object}|{error: string}>} the fields to save, or the words to refuse with
 */
const checkAddress = async (body = {}, { lookupFn = lookup } = {}) => {
  const out = { ...body };
  if (out.phoneNumber !== undefined) out.phoneNumber = cleanPhone(out.phoneNumber);
  if (out.landmark !== undefined) out.landmark = String(out.landmark || '').replace(/[<>]/g, '').trim().slice(0, 80);
  for (const k of ['street', 'city', 'state', 'label']) if (out[k] !== undefined) out[k] = String(out[k] || '').trim();

  if (out.zipCode !== undefined) {
    out.zipCode = digits(out.zipCode);
    if (!/^[1-9]\d{5}$/.test(out.zipCode)) return { error: 'Enter the 6-digit PIN code' };
    let found;
    try {
      found = await lookupFn(out.zipCode);
    } catch {
      found = undefined; // could not check - not the customer's fault
    }
    if (found === null) return { error: `No such PIN code (${out.zipCode}) - check the six digits` };
    if (found) {
      if (!out.city) out.city = found.city;
      if (norm(out.state) !== norm(found.state)) out.state = found.state;
    }
  }
  return { value: out };
};

module.exports = { checkAddress, cleanPhone };
