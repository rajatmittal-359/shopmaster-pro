const mongoose = require('mongoose');

/**
 * Every question asked of "Ask ShopMaster" and what it answered - so the
 * admin can read what sellers and customers actually struggle with, and
 * catch a wrong answer before it becomes policy. Kept 90 days.
 */
const assistLogSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['seller', 'admin', 'customer'], required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    question: { type: String, required: true, maxlength: 1500 },
    /** The language chip at the time: hi | hg | en | null (matched the question). */
    language: { type: String, enum: ['hi', 'hg', 'en', null], default: null },
    answer: { type: String, default: '' },
    model: { type: String, default: null },
    searchedWeb: { type: Boolean, default: false },
    /** Which lookups the model made and which passages it was shown - the
     *  admin reads these to see whether a wrong answer was a wrong source. */
    calls: { type: [String], default: [] },
    retrieved: { type: [String], default: [] },
    ms: { type: Number, default: 0 },
    ok: { type: Boolean, default: true },
    /** What the answer gate complained about on the way out - empty when it
     *  was clean. The offline exam runs weekly on eleven fixed questions;
     *  this is the same grading on the real ones, as they happen. */
    quality: { type: [String], default: [] },
    /** How much the answer had to read: the retrieval road that ran
     *  (none | vector | text | both) and how many passages it returned. Read
     *  with `quality` - a repaired answer that also had `via: 'none'` is a
     *  retrieval problem wearing a model problem's clothes. */
    via: String,
    chunks: Number,
    /** The person's verdict, when they give one. */
    helpful: { type: Boolean, default: null },
  },
  { timestamps: true }
);
assistLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });

module.exports = mongoose.model('AssistLog', assistLogSchema);
