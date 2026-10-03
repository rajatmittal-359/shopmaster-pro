const mongoose = require('mongoose');

/**
 * One run of the assistant's exam (utils/ai/evals, plan 2.23): when, how
 * many cases, how many clean, which road answered, and every row's
 * problems in words. Weekly from the scheduled job, or by hand from
 * `node evalAssistant.js --save`. /admin/ask draws the last twelve as the
 * quality trend - the thing that says whether a prompt change or a new
 * road made the assistant better or worse for the people who use it.
 */
const evalRunSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now, index: true },
    cases: { type: Number, default: 0 },
    clean: { type: Number, default: 0 },
    byModel: { type: Object, default: {} },
    rows: {
      type: [
        {
          _id: false,
          role: String,
          language: String,
          question: String,
          model: String,
          ms: Number,
          words: Number,
          // What the answer had to read: the retrieval road that ran
          // (none | vector | text | both) and how many passages it returned.
          // Recorded, never acted on - see tests/evalEvidence.test.mjs.
          via: String,
          chunks: Number,
          problems: { type: [String], default: [] },
        },
      ],
      default: [],
    },
  },
  { timestamps: false, minimize: false }
);

module.exports = mongoose.model('EvalRun', evalRunSchema);
