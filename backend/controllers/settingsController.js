const PlatformSettings = require('../models/PlatformSettings');
const RULES = require('../config/sellerRules');
const { sendError } = require('../utils/apiError');

/**
 * Platform settings - the admin's Settings page and the public read.
 *
 * The public read is what the storefront needs to draw itself: business
 * identity, links, storefront switches, the announcement. It is cached five
 * minutes at the edge and re-read by the Next app on its own schedule.
 * Rules go out through /public/seller-rules as before (the live object).
 */
const RULE_KEYS = Object.keys(RULES.defaults);

const publicView = (doc) => ({
  business: doc.business,
  links: Object.fromEntries(Object.entries(doc.links || {}).filter(([, v]) => v)),
  shop: doc.shop,
  announcement: doc.announcement && doc.announcement.enabled ? doc.announcement : { enabled: false },
  rulesVersion: doc.rules && doc.rules.version,
  updatedAt: doc.updatedAt,
});

exports.publicSettings = async (req, res) => {
  try {
    const doc = await PlatformSettings.current();
    res.set('Cache-Control', 'public, max-age=300');
    res.json(publicView(doc));
  } catch (error) {
    sendError(res, error);
  }
};

exports.getSettings = async (req, res) => {
  try {
    const doc = await PlatformSettings.current();
    res.json({ settings: doc, defaults: { rules: RULES.defaults } });
  } catch (error) {
    sendError(res, error);
  }
};

/** Bump 1.0 → 1.1 → … 1.9 → 2.0. Rules changes are agreement changes. */
const bump = (v) => {
  const [maj, min] = String(v || '1.0').split('.').map((n) => Number(n) || 0);
  return min >= 9 ? `${maj + 1}.0` : `${maj}.${min + 1}`;
};

exports.updateSettings = async (req, res) => {
  try {
    const doc = await PlatformSettings.current();
    const body = req.body || {};

    // Only keys the schema knows; anything else in the body is ignored.
    for (const block of ['business', 'links', 'shop', 'announcement']) {
      if (body[block] && typeof body[block] === 'object') {
        for (const [k, v] of Object.entries(body[block])) {
          if (doc.schema.path(`${block}.${k}`)) doc.set(`${block}.${k}`, v);
        }
      }
    }

    if (body.rules && typeof body.rules === 'object') {
      let changed = false;
      for (const k of RULE_KEYS) {
        if (k === 'version' || k === 'effectiveFrom' || body.rules[k] === undefined) continue;
        const next = Number(body.rules[k]);
        if (Number.isNaN(next)) return res.status(400).json({ message: `${k} must be a number` });
        if (doc.rules[k] !== next) {
          doc.rules[k] = next;
          changed = true;
        }
      }
      if (changed) {
        // A changed number is a new agreement: every seller accepts again.
        doc.rules.version = bump(doc.rules.version);
        doc.rules.effectiveFrom = new Date().toISOString().slice(0, 10);
      }
    }

    doc.updatedBy = req.user._id;
    await doc.save();
    await RULES.loadRules();
    require('../utils/liveSettings').forget();
    res.json({ settings: doc, rulesVersion: doc.rules.version });
  } catch (error) {
    if (error.name === 'ValidationError') return res.status(400).json({ message: Object.values(error.errors)[0]?.message || 'Check the values' });
    sendError(res, error);
  }
};
