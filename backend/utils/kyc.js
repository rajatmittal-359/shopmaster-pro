/**
 * Seller identity checks - the free, offline ones (plan 2.40, 15 Sep 2026).
 *
 * WHAT THE BIG MARKETPLACES DO
 *   Amazon.in: PAN + GSTIN (or an exempt category) + bank proof + address
 *   proof, then a video KYC. Flipkart: GSTIN + PAN + bank + pickup address;
 *   most rejections are the GST name not matching the PAN or the bank
 *   holder. Meesho: PAN + Aadhaar + bank + GSTIN OR the GST portal's
 *   Enrolment Number for unregistered suppliers (intra-state only, under
 *   ₹40 lakh - notification 34/2023). The Consumer Protection (E-Commerce)
 *   Rules 2020 make the marketplace display each seller's legal name,
 *   address, contact and GSTIN/PAN.
 *
 * WHAT WE CAN CHECK FOR NOTHING, IN A MILLISECOND
 *   A GSTIN carries its own checksum (mod-36, last character), the state
 *   code (first two digits - 08 is Rajasthan) and the PAN (characters 3 to
 *   12). So without any API: is the GSTIN real-shaped, does it belong to
 *   the PAN typed, is it registered in the state the pickup address is in.
 *   A PAN's fourth letter says what kind of holder it is (P person, C
 *   company, F firm, H HUF…). An IFSC resolves to a bank and branch through
 *   Razorpay's free public dataset (ifsc.razorpay.com). Names are compared
 *   loosely, the way a person would.
 *
 * WHAT THIS IS NOT
 *   Not a verdict, not a KYC provider. Every check is a fact for the admin's
 *   "Before you approve" list; the admin decides. No Aadhaar, no penny drop,
 *   no video call - the first payout is the penny drop, and the shop's own
 *   photo is the video call.
 */
const PAN_RE = /^[A-Z]{3}[ABCFGHLJPTK][A-Z][0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const PAN_TYPES = { P: 'individual', C: 'company', F: 'partnership firm', H: 'HUF', A: 'association', B: 'body of individuals', G: 'government', J: 'artificial juridical person', L: 'local authority', T: 'trust', K: 'krish' };

/** GST state codes (the first two digits of a GSTIN). */
const STATES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar',
  '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};

/**
 * PIN code prefixes per state - India Post's zones. Ranges overlap at a few
 * borders (Uttarakhand inside UP's 24-26, Jharkhand inside Bihar's 81-83), so
 * a match is "consistent", never "proven"; only a clear miss is flagged.
 */
const PIN_PREFIXES = {
  '07': [['11', '11']], '06': [['12', '13']], '03': [['14', '15']], '04': [['16', '16']], '02': [['17', '17']], '01': [['18', '19']], '38': [['19', '19']],
  '09': [['20', '28']], '05': [['24', '26']], '08': [['30', '34']], '24': [['36', '39']], '26': [['39', '39']], '27': [['40', '44']], '30': [['40', '40']],
  '23': [['45', '48']], '22': [['49', '49']], '36': [['50', '50']], '37': [['50', '53']], '29': [['56', '59']], '33': [['60', '64']], '34': [['60', '60'], ['67', '67']],
  '32': [['67', '69']], '31': [['68', '68']], '19': [['70', '74']], '11': [['73', '73']], '35': [['74', '74']], '21': [['75', '77']], '18': [['78', '78']],
  '12': [['79', '79']], '13': [['79', '79']], '14': [['79', '79']], '15': [['79', '79']], '16': [['79', '79']], '17': [['79', '79']], '10': [['80', '85']], '20': [['81', '83']],
};

const clean = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();

/** @returns {{ok:boolean, value:string, type?:string, reason?:string}} */
const checkPan = (raw) => {
  const value = clean(raw);
  if (!value) return { ok: false, value, reason: 'PAN is empty' };
  if (value.length !== 10) return { ok: false, value, reason: 'A PAN is 10 characters - 5 letters, 4 digits, 1 letter' };
  if (!PAN_RE.test(value)) return { ok: false, value, reason: 'That is not a valid PAN shape (e.g. ABCPD1234E)' };
  return { ok: true, value, type: PAN_TYPES[value[3]] || 'other' };
};

/**
 * GSTIN check character: mod-36 over the first 14 characters, alternating
 * weights 1 and 2, digits summed in base 36 - the algorithm GSTN publishes.
 */
const gstinCheckChar = (first14) => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const v = chars.indexOf(first14[i]);
    const w = (i % 2 === 0 ? 1 : 2) * v;
    sum += Math.floor(w / 36) + (w % 36);
  }
  return chars[(36 - (sum % 36)) % 36];
};

/** @returns {{ok:boolean, value:string, pan?:string, stateCode?:string, state?:string, reason?:string}} */
const checkGstin = (raw) => {
  const value = clean(raw);
  if (!value) return { ok: false, value, reason: 'GSTIN is empty' };
  if (value.length !== 15) return { ok: false, value, reason: 'A GSTIN is 15 characters' };
  if (!GSTIN_RE.test(value)) return { ok: false, value, reason: 'That is not a valid GSTIN shape (e.g. 08ABCPD1234E1Z5)' };
  const stateCode = value.slice(0, 2);
  if (!STATES[stateCode]) return { ok: false, value, reason: `No state has the code ${stateCode}` };
  if (gstinCheckChar(value.slice(0, 14)) !== value[14]) return { ok: false, value, reason: 'The check digit does not match - one character is mistyped' };
  return { ok: true, value, pan: value.slice(2, 12), stateCode, state: STATES[stateCode] };
};

/**
 * The GST portal's Enrolment Number for suppliers without a GSTIN
 * (notification 34/2023): PAN-based, state-bound, 15 characters like a
 * GSTIN. The portal does not publish a check-digit rule for it, so this
 * checks the shape, the state and the PAN inside - and the admin sees it.
 */
const checkEnrolment = (raw) => {
  const value = clean(raw);
  if (!value) return { ok: false, value, reason: 'Enrolment number is empty' };
  if (value.length !== 15 || !/^[0-9]{2}[A-Z0-9]{13}$/.test(value)) return { ok: false, value, reason: 'An enrolment number is 15 characters, starting with the state code' };
  const stateCode = value.slice(0, 2);
  if (!STATES[stateCode]) return { ok: false, value, reason: `No state has the code ${stateCode}` };
  const pan = value.slice(2, 12);
  if (!PAN_RE.test(pan)) return { ok: false, value, reason: 'Characters 3 to 12 should be the PAN' };
  return { ok: true, value, pan, stateCode, state: STATES[stateCode] };
};

const checkIfsc = (raw) => {
  const value = clean(raw);
  if (!IFSC_RE.test(value)) return { ok: false, value, reason: 'An IFSC is 4 letters, a zero, then 6 characters (e.g. HDFC0001234)' };
  return { ok: true, value };
};

/**
 * Bank and branch for an IFSC, from Razorpay's open dataset. Free, no key,
 * ~100 ms. Never throws: a network blip returns ok:false and the admin sees
 * "could not look up" rather than a wrong bank.
 */
const lookupIfsc = async (raw, { fetchImpl = globalThis.fetch, timeoutMs = 4000 } = {}) => {
  const shape = checkIfsc(raw);
  if (!shape.ok) return { ok: false, value: shape.value, reason: shape.reason };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`https://ifsc.razorpay.com/${shape.value}`, { signal: ctrl.signal });
    if (res.status === 404) return { ok: false, value: shape.value, reason: 'No bank branch has this IFSC' };
    if (!res.ok) return { ok: false, value: shape.value, reason: `IFSC lookup said ${res.status}` };
    const d = await res.json();
    return { ok: true, value: shape.value, bank: d.BANK || '', branch: d.BRANCH || '', city: d.CITY || '', state: d.STATE || '', upi: Boolean(d.UPI) };
  } catch (err) {
    return { ok: false, value: shape.value, reason: err.name === 'AbortError' ? 'IFSC lookup timed out' : `IFSC lookup failed: ${err.message}` };
  } finally {
    clearTimeout(timer);
  }
};

/** Does a PIN code sit in a GST state? true / false / null (unknown state or PIN). */
const pinMatchesState = (pin, stateCode) => {
  const p = String(pin || '').replace(/\D/g, '');
  const ranges = PIN_PREFIXES[stateCode];
  if (p.length !== 6 || !ranges) return null;
  const prefix = p.slice(0, 2);
  return ranges.some(([lo, hi]) => prefix >= lo && prefix <= hi);
};

/**
 * Loose name agreement, the way a person reads it: case, punctuation and
 * business suffixes ignored; agree when one contains the other or they
 * share most words. "Meera Jewels" ~ "MEERA JEWELS PVT LTD" ~
 * "Asha Sharma (Meera Jewels)". Never a hard stop - a warning.
 */
const NOISE = new Set(['pvt', 'private', 'ltd', 'limited', 'llp', 'and', '&', 'the', 'co', 'company', 'enterprises', 'enterprise', 'traders', 'trading', 'store', 'stores', 'shop', 'm/s', 'ms', 'mr', 'mrs', 'smt', 'shri', 'sri']);
const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !NOISE.has(w));
const namesAgree = (a, b) => {
  const A = words(a);
  const B = words(b);
  if (!A.length || !B.length) return null;
  const setB = new Set(B);
  const common = A.filter((w) => setB.has(w)).length;
  return common / Math.min(A.length, B.length) >= 0.5;
};

/**
 * The checklist for one application - facts the admin reads as ticks,
 * warnings and dashes. `ok` true = tick, false = warning, null = not given.
 *
 * @param {object} seller  Seller doc (lean), with `application`, `bankDetails`, `pickupAddress`, `gstNumber`
 * @returns {Array<{key:string, ok:boolean|null, label:string, detail?:string}>}
 */
const applicationChecks = (seller = {}) => {
  const app = seller.application || {};
  const out = [];
  const pan = app.pan ? checkPan(app.pan) : null;
  out.push(pan ? { key: 'pan', ok: pan.ok, label: pan.ok ? `PAN valid · ${pan.type}` : `PAN: ${pan.reason}` } : { key: 'pan', ok: null, label: 'No PAN given' });

  const gstin = app.gstin || seller.gstNumber || '';
  const mode = app.gstMode || (gstin ? 'gstin' : app.enrolmentNumber ? 'enrolment' : 'none');
  const pin = seller.pickupAddress?.pincode || app.pincode || '';
  if (mode === 'gstin' && gstin) {
    const g = checkGstin(gstin);
    out.push({ key: 'gstin', ok: g.ok, label: g.ok ? `GSTIN valid · ${g.state}` : `GSTIN: ${g.reason}` });
    if (g.ok && pan?.ok) out.push({ key: 'gst-pan', ok: g.pan === pan.value, label: g.pan === pan.value ? 'GSTIN belongs to this PAN' : `GSTIN is registered to PAN ${g.pan}, not ${pan.value}` });
    if (g.ok && pin) {
      const m = pinMatchesState(pin, g.stateCode);
      if (m !== null) out.push({ key: 'gst-state', ok: m, label: m ? `Pickup PIN ${pin} is in ${g.state}` : `Pickup PIN ${pin} is not in ${g.state}, where the GSTIN is registered` });
    }
  } else if (mode === 'enrolment' && app.enrolmentNumber) {
    const e = checkEnrolment(app.enrolmentNumber);
    out.push({ key: 'enrolment', ok: e.ok, label: e.ok ? `GST enrolment (no GSTIN) · ${e.state} · may sell within ${e.state} only` : `Enrolment number: ${e.reason}` });
    if (e.ok && pan?.ok) out.push({ key: 'enrol-pan', ok: e.pan === pan.value, label: e.pan === pan.value ? 'Enrolment belongs to this PAN' : `Enrolment carries PAN ${e.pan}, not ${pan.value}` });
    if (e.ok && pin) {
      const m = pinMatchesState(pin, e.stateCode);
      if (m !== null) out.push({ key: 'enrol-state', ok: m, label: m ? `Pickup PIN ${pin} is in ${e.state}` : `Pickup PIN ${pin} is outside ${e.state} - an enrolled seller may only ship within the state` });
    }
  } else {
    out.push({ key: 'gst', ok: null, label: 'No GSTIN or enrolment yet - may sell within Rajasthan only, under ₹40 lakh a year' });
  }

  const bank = seller.bankDetails || {};
  if (bank.accountNumber) {
    if (bank.bankName) out.push({ key: 'ifsc', ok: true, label: `Bank: ${bank.bankName}${bank.branch ? `, ${bank.branch}` : ''}` });
    else if (bank.ifscLookupFailed) out.push({ key: 'ifsc', ok: false, label: `IFSC ${bank.ifscCode}: ${bank.ifscLookupFailed}` });
    else out.push({ key: 'ifsc', ok: null, label: `IFSC ${bank.ifscCode} (not looked up yet)` });
    const legal = app.legalName || seller.businessName;
    const agree = namesAgree(bank.accountHolderName, legal);
    if (agree !== null) out.push({ key: 'bank-name', ok: agree, label: agree ? `Account holder matches "${legal}"` : `Account holder "${bank.accountHolderName}" does not read like "${legal}" - ask whose account it is` });
  } else {
    out.push({ key: 'bank', ok: null, label: 'No bank account yet (needed before the first payout, not before approval)' });
  }

  out.push({ key: 'photo', ok: app.shopPhoto ? true : null, label: app.shopPhoto ? 'Shop photo given' : 'No shop photo' });
  return out;
};

module.exports = { checkPan, checkGstin, checkEnrolment, checkIfsc, lookupIfsc, gstinCheckChar, pinMatchesState, namesAgree, applicationChecks, STATES, PAN_TYPES };
