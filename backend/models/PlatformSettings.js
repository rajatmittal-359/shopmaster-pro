const mongoose = require('mongoose');

/**
 * The platform's settings - one document, edited from the admin panel.
 *
 * WHY (Rajat, 13 Sep 2026)
 *   "Har chhoti cheez ke liye code me na aana pade." Shopify's Settings,
 *   WooCommerce's Options, Magento's Configuration: the things a shop
 *   owner changes - who they are, what they charge, what is switched on,
 *   what the banner says - live in the database behind a settings page,
 *   and the code carries the defaults. Same here.
 *
 * WHAT LIVES HERE AND WHAT DOES NOT
 *   Here: business identity, the seller rulebook's numbers, storefront
 *   switches, the announcement bar, links. NOT here: secrets and keys
 *   (env), the category tree (its own page), coupons (their own page),
 *   AI limits (their own page).
 *
 * RULES AND THE AGREEMENT
 *   Changing a rulebook number is changing the Seller Agreement. Saving the
 *   rules block bumps `rules.version` and stamps `effectiveFrom`; every
 *   seller then sees the banner and accepts again (config/sellerRules reads
 *   from here with the code's numbers as the default).
 */
const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'platform' },

    business: {
      tradeName: { type: String, trim: true, default: 'ShopMaster Pro' },
      legalName: { type: String, trim: true, default: 'ShopMaster Pro' },
      tagline: { type: String, trim: true, default: 'A marketplace from Jaipur' },
      email: { type: String, trim: true, default: '' },
      phone: { type: String, trim: true, default: '' },
      whatsapp: { type: String, trim: true, default: '' },
      address1: { type: String, trim: true, default: '' },
      address2: { type: String, trim: true, default: '' },
      city: { type: String, trim: true, default: 'Jaipur' },
      state: { type: String, trim: true, default: 'Rajasthan' },
      pincode: { type: String, trim: true, default: '' },
      hours: { type: String, trim: true, default: '' },
      gstin: { type: String, trim: true, default: '' },
      /*
       * The Consumer Protection (E-Commerce) Rules 2020, rule 4(4)-(5): every
       * e-commerce entity names a grievance officer (and a nodal contact
       * resident in India), displays name, designation and contact, acknowledges
       * a complaint within 48 hours and resolves it within a month. Shown on
       * Contact, Privacy and Terms; empty until the admin fills it in.
       */
      grievanceName: { type: String, trim: true, default: '' },
      grievanceDesignation: { type: String, trim: true, default: 'Grievance Officer' },
      grievanceEmail: { type: String, trim: true, default: '' },
      grievancePhone: { type: String, trim: true, default: '' },
      /*
       * The E-Commerce (Amendment) Rules 2026, in force 1 January 2027: every
       * marketplace runs an annual self-audit against the Dark Patterns
       * Guidelines 2023 and displays a compliance certificate on the site.
       * /compliance prints these three when filled; until then it says the
       * first audit is due. Filled by the admin once a year, nowhere else.
       */
      selfAuditYear: { type: String, trim: true, default: '' },
      selfAuditDate: { type: String, trim: true, default: '' },
      selfAuditBy: { type: String, trim: true, default: '' },
    },

    links: {
      instagram: { type: String, trim: true, default: '' },
      facebook: { type: String, trim: true, default: '' },
      youtube: { type: String, trim: true, default: '' },
      googleBusiness: { type: String, trim: true, default: '' },
      justdial: { type: String, trim: true, default: '' },
    },

    rules: {
      version: { type: String, default: '1.0' },
      effectiveFrom: { type: String, default: '2026-09-12' },
      cancelFreePer30Days: { type: Number, default: 2, min: 0 },
      cancelPenalty: { type: Number, default: 50, min: 0 },
      cancelRateReviewPct: { type: Number, default: 5, min: 0, max: 100 },
      dispatchDays: { type: Number, default: 2, min: 1 },
      returnWindowDays: { type: Number, default: 7, min: 0 },
      payoutAfterDeliveryDays: { type: Number, default: 7, min: 0 },
      disputeResponseHours: { type: Number, default: 72, min: 1 },
      defaultCommissionPct: { type: Number, default: 8, min: 0, max: 50 },
      // Fair Returns (plan §4.39)
      damagedClaimHours: { type: Number, default: 48, min: 1 },
      receiptCheckHours: { type: Number, default: 48, min: 1 },
      goodwillCapRupees: { type: Number, default: 500, min: 0 },
      otpDeliveryAbove: { type: Number, default: 2000, min: 0 },
      unboxingVideoAbove: { type: Number, default: 2000, min: 0 },
      adminReviewAbove: { type: Number, default: 5000, min: 0 },
    },

    shop: {
      codEnabled: { type: Boolean, default: true },
      sameDayEnabled: { type: Boolean, default: true },
      sellerSignupOpen: { type: Boolean, default: true },
      /** Orders at or above this amount ship free (0 = never). */
      freeShippingAbove: { type: Number, default: 0, min: 0 },
      /** The representative delivery charge quoted to Google and used in schema. */
      shippingRate: { type: Number, default: 100, min: 0 },
    },

    /**
     * The home page's words and its one featured strip (19 Sep 2026) -
     * Shopify's theme sections and Amazon's storefront, cut to what a
     * festival needs: change the first line for Diwali, put "Diwali picks"
     * above "Just added", without a deploy. Empty text = the built-in copy.
     * The strip is any /shop link the admin filtered themselves (a saved
     * search is what a "collection" is); it switches itself off after
     * `featuredUntil`.
     */
    home: {
      kicker: { type: String, trim: true, maxlength: 60, default: '' },
      title: { type: String, trim: true, maxlength: 90, default: '' },
      lead: { type: String, trim: true, maxlength: 140, default: '' },
      featuredTitle: { type: String, trim: true, maxlength: 60, default: '' },
      featuredHref: { type: String, trim: true, default: '', match: [/^$|^\/shop(\?[^\s]*)?$/, 'The featured link must be a /shop page on this site, filters included'] },
      featuredUntil: { type: Date, default: null },
    },

    announcement: {
      enabled: { type: Boolean, default: false },
      text: { type: String, trim: true, maxlength: 140, default: '' },
      href: { type: String, trim: true, default: '', match: [/^$|^\/(?!\/)|^https?:\/\//i, 'The link must be a path on this site or an http(s) address'] },
      /** Show to: everyone, or only signed-in sellers. */
      audience: { type: String, enum: ['everyone', 'sellers'], default: 'everyone' },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, minimize: false }
);

/** The one document, created with defaults on first read. */
settingsSchema.statics.current = async function () {
  return (await this.findById('platform')) || this.create({ _id: 'platform' });
};

module.exports = mongoose.model('PlatformSettings', settingsSchema);
