const mongoose = require('mongoose');

/**
 * One signed-in device (utils/auth/session, 19 Sep 2026).
 *
 * The refresh token itself is never stored - only its SHA-256, the way the
 * password-reset token already is. Rotation: every refresh revokes this row
 * (replacedBy → the new one) and issues a new token in the same `family`;
 * a revoked token turning up again means it was copied, and the whole
 * family is ended. `expiresAt` carries a TTL index so dead rows leave on
 * their own; `revokedAt` rows stay until then so reuse can be detected.
 */
const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    ua: { type: String, default: '' },
    ip: { type: String, default: '' },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', sessionSchema);
