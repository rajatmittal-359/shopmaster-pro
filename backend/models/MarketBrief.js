const mongoose = require('mongoose');

/**
 * One market brief per selling category, rebuilt weekly by the `market-brief`
 * job (utils/ai/marketBrief). Read by Ask ShopMaster's marketBrief tool and
 * the admin's market page; never written by a request.
 */
const marketBriefSchema = new mongoose.Schema(
  {
    category: { name: String, slug: { type: String, index: true } },
    weekOf: String,
    band: { low: Number, high: Number, typical: Number },
    typicalBenchmark: Number,
    sources: [String],
    trending: [String],
    note: String,
    // `monthly` is Google Keyword Planner's India-wide searches per month
    // (utils/google/ads). Absent on briefs built before 27 Sep 2026, and on
    // words Google reports too rarely to count - both mean "we do not know",
    // never "nobody searches it".
    words: [{ _id: false, word: String, sources: [String], monthly: Number }],
    bestSellers: [{ _id: false, title: String, rank: Number, brand: String }],
    googleQueries: [{ _id: false, query: String, impressions: Number, clicks: Number }],
    builtAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.models.MarketBrief || mongoose.model('MarketBrief', marketBriefSchema);
