// Mirror of backend/utils/kyc.js - the checks that run as the applicant types,
// so a mistyped GSTIN is caught in the field, not by the admin a day later.
// Keep the two in step; the server is the judge either way.
const PAN_RE = /^[A-Z]{3}[ABCFGHLJPTK][A-Z][0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const STATES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar',
  '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};

const clean = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();

export const checkPan = (raw) => {
  const value = clean(raw);
  if (!value) return { ok: false, value, reason: '' };
  if (value.length < 10) return { ok: false, value, reason: '' };
  if (value.length !== 10 || !PAN_RE.test(value)) return { ok: false, value, reason: 'A PAN looks like ABCPD1234E - 5 letters, 4 digits, 1 letter' };
  return { ok: true, value };
};

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

export const checkGstin = (raw) => {
  const value = clean(raw);
  if (!value || value.length < 15) return { ok: false, value, reason: '' };
  if (value.length !== 15 || !GSTIN_RE.test(value)) return { ok: false, value, reason: 'A GSTIN looks like 08ABCPD1234E1Z5 - 15 characters' };
  const stateCode = value.slice(0, 2);
  if (!STATES[stateCode]) return { ok: false, value, reason: `No state has the code ${stateCode}` };
  if (gstinCheckChar(value.slice(0, 14)) !== value[14]) return { ok: false, value, reason: 'One character is mistyped - the check digit does not match' };
  return { ok: true, value, pan: value.slice(2, 12), state: STATES[stateCode] };
};

export const checkEnrolment = (raw) => {
  const value = clean(raw);
  if (!value || value.length < 15) return { ok: false, value, reason: '' };
  if (value.length !== 15 || !/^[0-9]{2}[A-Z0-9]{13}$/.test(value)) return { ok: false, value, reason: '15 characters, starting with your state code (08 for Rajasthan)' };
  const stateCode = value.slice(0, 2);
  if (!STATES[stateCode]) return { ok: false, value, reason: `No state has the code ${stateCode}` };
  const pan = value.slice(2, 12);
  if (!PAN_RE.test(pan)) return { ok: false, value, reason: 'Characters 3 to 12 should be your PAN' };
  return { ok: true, value, pan, state: STATES[stateCode] };
};

export const checkIfsc = (raw) => {
  const value = clean(raw);
  if (!value || value.length < 11) return { ok: false, value, reason: '' };
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(value)) return { ok: false, value, reason: 'An IFSC looks like HDFC0001234' };
  return { ok: true, value };
};
