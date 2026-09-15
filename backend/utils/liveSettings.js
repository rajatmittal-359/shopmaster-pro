const PlatformSettings = require('../models/PlatformSettings');

/**
 * The admin's settings as the request handlers read them: one document,
 * remembered for a minute, never a reason for a 500 - a read that fails
 * (no database under test, a blip) returns `null` and the caller keeps the
 * code's default. Saving from the Settings page calls `forget()`.
 */
const TTL = 60 * 1000;
let cache = { at: 0, doc: null };

const liveSettings = async () => {
  if (Date.now() - cache.at < TTL) return cache.doc;
  try {
    // Under test the connection never opens; do not wait on it.
    if (PlatformSettings.db.readyState !== 1) return cache.doc;
    const doc = await PlatformSettings.findById('platform').lean();
    cache = { at: Date.now(), doc };
  } catch (err) {
    // Since 15 Sep 2026 this document decides money (free delivery above,
    // same-day, COD): a failed read is said, and not cached, so the next
    // request tries again instead of running a minute on the code's defaults.
    console.error('liveSettings read failed - defaults in force for this request:', err.message);
  }
  return cache.doc;
};

const forget = () => {
  cache = { at: 0, doc: null };
};

module.exports = { liveSettings, forget };
