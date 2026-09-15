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
 * Who runs the marketplace - the OPERATOR, never a seller.
 *
 * Razorpay's website check and Google Merchant Center both require a real
 * postal address, a working phone and a working email - not a form alone.
 *
 * THE PLATFORM IS NOT ANY OF ITS SELLERS (Rajat, 15 Sep 2026)
 *   Amazon does not sign its footer "Cloudtail"; Myntra does not print
 *   "Roadster" as its legal name. ShopMaster Pro's legal name, phone and
 *   address are the operator's own and are set in /admin/settings →
 *   Business. Nothing here, on any public page, in any invoice, mail or
 *   structured data may name a seller as the platform - which shop the
 *   operator's family runs is that shop's business, not the frame's.
 */
export const BUSINESS = {
  legalName: 'ShopMaster Pro',
  tradeName: 'ShopMaster Pro',
  addressLines: ['Jaipur, Rajasthan', 'India'],
  landmark: '',
  phone: process.env.NEXT_PUBLIC_BUSINESS_PHONE || '',
  phoneHref: process.env.NEXT_PUBLIC_BUSINESS_PHONE ? `tel:${process.env.NEXT_PUBLIC_BUSINESS_PHONE.replace(/[^\d+]/g, '')}` : '',
  email: process.env.NEXT_PUBLIC_BUSINESS_EMAIL || 'hello@example.com',
  hours: 'Monday to Saturday, 10am - 7pm IST',
  /**
   * The same business elsewhere on the web - Instagram, Justdial, the Google
   * Business Profile. Google's Organization schema reads these as `sameAs`
   * and uses them to join the site to the profiles it already trusts.
   * Empty entries are dropped; fill in as Rajat sends the links.
   */
  sameAs: (process.env.NEXT_PUBLIC_SAME_AS || '').split(',').map((s) => s.trim()).filter(Boolean),
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
  ['Selling on ShopMaster Pro', '/selling-policy'],
  ['Contact us', '/contact'],
  ['Shipping policy', '/shipping-policy'],
  ['Returns & refunds', '/refund-policy'],
  ['Pricing', '/pricing'],
  ['Terms & conditions', '/terms'],
  ['Privacy policy', '/privacy'],
];

/**
 * BUSINESS as the admin last saved it (Settings → Who we are), merged over
 * the defaults above. Server components await this; client components keep
 * the defaults. A blank field in the settings never blanks the page - the
 * default stands until a real value replaces it.
 */
export const businessFrom = (settings) => {
  const b = settings?.business || {};
  const pick = (v, d) => (v && String(v).trim() ? String(v).trim() : d);
  const phone = pick(b.phone, BUSINESS.phone);
  const line1 = pick(b.address1, BUSINESS.addressLines[0]);
  const cityLine = b.city || b.state || b.pincode ? `${pick(b.city, 'Jaipur')}, ${pick(b.state, 'Rajasthan')} ${pick(b.pincode, '302019')}`.trim() : BUSINESS.addressLines[1];
  const links = settings?.links || {};
  return {
    ...BUSINESS,
    legalName: pick(b.legalName, BUSINESS.legalName),
    tradeName: pick(b.tradeName, BUSINESS.tradeName),
    email: pick(b.email, BUSINESS.email),
    phone,
    phoneHref: `tel:${phone.replace(/[^\d+]/g, '')}`,
    whatsapp: pick(b.whatsapp, BUSINESS.phoneHref.replace(/\D/g, '')),
    addressLines: [line1, cityLine, 'India'],
    landmark: pick(b.address2, BUSINESS.landmark),
    hours: pick(b.hours, BUSINESS.hours),
    sameAs: Object.values(links).filter(Boolean).length ? Object.values(links).filter(Boolean) : BUSINESS.sameAs,
  };
};
