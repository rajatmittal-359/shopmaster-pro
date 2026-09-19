const mongoose = require('mongoose');

/**
 * What happened to an account and from where (19 Sep 2026): sign-ins, the
 * failures before a lock, the lock itself, log-outs, password changes, a
 * refresh token used twice, a step-up, a bank-detail change. The record a
 * dispute, a "that was not me" mail or the DPDP access right asks for.
 * Kept 180 days (TTL), the same window the risk records use.
 */
const authEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    type: { type: String, required: true, index: true },
    ip: { type: String, default: '' },
    ua: { type: String, default: '' },
    meta: { type: Object, default: undefined },
    at: { type: Date, default: Date.now },
  },
  { timestamps: false, minimize: false }
);

authEventSchema.index({ at: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

module.exports = mongoose.model('AuthEvent', authEventSchema);
