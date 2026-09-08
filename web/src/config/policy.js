/**
 * The shop's public promises, in one place.
 *
 * WHY THESE ARE NOT WRITTEN INTO THE PAGES
 *   Every number here appears twice over: once in the policy page a customer
 *   reads, and once in the Product structured data Google shows in search
 *   results. Typed separately they drift, and then the shop is advertising a
 *   7-day return in Google while its own page says 10 - which is the kind of
 *   difference a payment aggregator treats as misrepresentation.
 *
 *   The return window is checked against the BACKEND too: utils/payout.js holds
 *   RETURN_WINDOW_DAYS, and that is what actually refuses a late return. If one
 *   of them changes, change both - a promise the code does not keep is worse
 *   than no promise.
 */
export const POLICY = {
  shippingRate: 100, // the representative freight quoted to Google, INR
  shippingCountry: 'IN',
  handlingDays: [1, 2], // business days to dispatch
  transitDays: [3, 7], // business days in transit
  returnDays: 7, // must equal RETURN_WINDOW_DAYS in backend/utils/payout.js
  refundDays: [5, 7], // business days for money to reach the customer
};

/**
 * Who the customer is buying from.
 *
 * Razorpay's website check and Google Merchant Center both require a real
 * postal address, a working phone and a working email - not a form alone. This
 * is the same address the Google Business Profile carries and the same one the
 * courier collects from.
 */
export const BUSINESS = {
  legalName: 'Charming Jewels',
  tradeName: 'ShopMaster Pro',
  addressLines: ['C-13, Hari Marg, Devi Nagar', 'Jaipur, Rajasthan 302019', 'India'],
  landmark: 'Near Meera Medical, Doorbin Hospital',
  phone: '+91 87697 66908',
  phoneHref: 'tel:+918769766908',
  email: 'rajatmittal359@gmail.com',
  hours: 'Monday to Saturday, 10am - 7pm IST',
};

/**
 * What the platform charges a seller, as a number the public page may state.
 *
 * It mirrors DEFAULT_COMMISSION_RATE in backend/utils/commission.js, which is
 * what a new seller actually gets. Individual shops can be set to something
 * else by an admin - a negotiated rate, or the platform's own shops at zero -
 * and that is deliberately NOT advertised anywhere: what one seller pays is
 * between them and us, and publishing the exceptions invites every other seller
 * to ask for one.
 */
export const COMMISSION_RATE = 8;

/** The policy pages, in the order a footer should list them. */
export const POLICY_PAGES = [
  ['Contact us', '/contact'],
  ['Shipping policy', '/shipping-policy'],
  ['Returns & refunds', '/refund-policy'],
  ['Pricing', '/pricing'],
  ['Terms & conditions', '/terms'],
  ['Privacy policy', '/privacy'],
];
