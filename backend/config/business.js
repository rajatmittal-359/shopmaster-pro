/**
 * Where the shop physically is.
 *
 * WHY THE BACKEND NEEDS THIS AT ALL
 *   Forward shipping never did: Shiprocket looks the pickup address up from the
 *   nickname in SHIPROCKET_PICKUP_LOCATION, so we only ever sent a pincode.
 *   A return goes the other way - the customer is the pickup and WE are the
 *   destination - so the full address has to be sent, in fields Shiprocket
 *   calls shipping_*.
 *
 *   The same address is already published to customers in the frontend's
 *   config/policy.js, is on the Bill of Supply, and is what the courier
 *   collects from. It is duplicated here rather than imported because the two
 *   halves of this project do not share a module system - so if it changes,
 *   change both. They are checked against each other by tests/business.test.mjs.
 *
 * Every field can be overridden by an env var, so a move does not need a
 * deploy of new code - but the default is the real address rather than a
 * placeholder, because a return that goes nowhere is worse than one that is
 * refused.
 */
const BUSINESS = {
  // The operator, never a seller (see web/src/config/policy.js).
  legalName: process.env.BUSINESS_NAME || 'ShopMaster Pro',
  contactName: process.env.BUSINESS_CONTACT_NAME || 'Rajat Mittal',
  address1: process.env.BUSINESS_ADDRESS_1 || '',
  address2: process.env.BUSINESS_ADDRESS_2 || '',
  city: process.env.BUSINESS_CITY || 'Jaipur',
  state: process.env.BUSINESS_STATE || 'Rajasthan',
  country: process.env.BUSINESS_COUNTRY || 'India',

  // Falls back to the pincode forward shipping already uses, so these two can
  // never disagree about where the shop is.
  pincode: process.env.BUSINESS_PINCODE || process.env.SHIPROCKET_PICKUP_PINCODE || '302019',

  phone: process.env.BUSINESS_PHONE || '',
  email: process.env.BUSINESS_EMAIL || process.env.BREVO_FROM_EMAIL || 'hello@example.com',
};

module.exports = { BUSINESS };
