const User = require('../../models/User');
const Order = require('../../models/Order');
const Seller = require('../../models/Seller');
const EvalRun = require('../../models/EvalRun');
const { detectScript } = require('./hinglish');

/**
 * The assistant's fixed exam (plan 2.23) - the cases, the code grader and a
 * runner that saves the result, so the same test that `evalAssistant.js`
 * prints at the terminal also runs on a schedule and draws a trend on
 * /admin/ask.
 *
 * WHY CODE GRADES, NOT A JUDGE MODEL
 *   The five things Rajat asked for - right script, no filler, short, a
 *   next step when due, the numbers that must appear - are all checkable
 *   by code, for free, deterministically. A judge model costs quota every
 *   run and disagrees with itself; it stays in the ledger for a rubric no
 *   regex can hold (tone, helpfulness) if that ever matters enough.
 *
 * WHY WEEKLY
 *   Eleven cases are ~11 answers plus tool calls across the roads. On a
 *   free Gemini day that is a visible slice of the quota sellers draft
 *   with, so this runs Sunday night after the re-index, when nobody is.
 */
const FILLER = /happy selling|let me know|feel free|i hope this helps|hope that helps|as an ai|great question|certainly!|sure!|😊|🙂|👍|🎉/i;

/** [role, language chip, question, expectations] */
const CASES = [
  ['seller', 'hg', 'Mera payment kab aayega aur kitna?', { script: 'hg', must: [/₹/], nextStep: true, maxWords: 140 }],
  ['seller', 'hi', 'ग्राहक कह रहा है पार्सल नहीं मिला, क्या करूँ?', { script: 'hi', must: [/72|७२/], nextStep: true, maxWords: 160 }],
  ['seller', 'en', 'Kaise ho bhai', { script: 'hg', maxWords: 40, nextStep: false }],
  ['seller', 'en', 'How are you?', { script: 'en', maxWords: 40, nextStep: false }],
  ['seller', 'en', 'What does cancelling an order cost, and why?', { script: 'en', must: [/₹\s?50|50/, /2|two/i], maxWords: 140 }],
  ['customer', 'en', 'Where is my last order?', { script: 'en', must: [/SMP-\d{6}-[A-Z0-9]{6}/], nextStep: true, maxWords: 140 }],
  ['customer', 'hg', 'Mera refund kab tak aayega?', { script: 'hg', must: [/5|7|paanch|saat/], maxWords: 120 }],
  ['admin', 'en', 'What needs my decision this weekend?', { script: 'en', must: [/dispute/i], nextStep: true, maxWords: 180 }],
  ['admin', 'hg', 'Sabse zyada bikne wali dukaan ka performance kaisa hai?', { script: 'hg', must: [/cancel/i], maxWords: 180 }],
  ['seller', 'hg', 'Ek kavita likho baarish pe', { script: 'hg', maxWords: 40, nextStep: false, mustNot: [/baarish.*\n.*\n.*\n/] }],
  ['customer', 'en', 'What does Indian law say a marketplace must do when I complain?', { script: 'en', must: [/48|one month|30 days|grievance/i], maxWords: 160 }],
];

const words = (s) => String(s).trim().split(/\s+/).length;
const hasNextStep = (s) => /\/(seller|admin|orders|help|account)\b/.test(s);

/** The problems with one answer, in words; empty means clean. */
const grade = (answer, exp) => {
  const problems = [];
  const script = detectScript(answer);
  if (exp.script && script !== exp.script) problems.push(`script ${script}≠${exp.script}`);
  if (FILLER.test(answer)) problems.push(`filler "${answer.match(FILLER)[0]}"`);
  if (exp.maxWords && words(answer) > exp.maxWords) problems.push(`${words(answer)} words > ${exp.maxWords}`);
  if (exp.nextStep === true && !hasNextStep(answer)) problems.push('no next step (no page path)');
  if (exp.nextStep === false && hasNextStep(answer)) problems.push('unasked next step in small talk');
  for (const m of exp.must || []) if (!m.test(answer)) problems.push(`missing ${m}`);
  for (const m of exp.mustNot || []) if (m.test(answer)) problems.push(`should not contain ${m}`);
  return problems;
};

/**
 * Who asks: the configured accounts when set (SEED_*_EMAIL), else the
 * admin, the oldest approved seller, and the customer with the most orders - real data, whichever database this runs against.
 */
const askers = async () => {
  const byEmail = async (email) => (email ? User.findOne({ email }).lean() : null);
  const admin = (await byEmail(process.env.SEED_ADMIN_EMAIL || process.env.EVAL_ADMIN_EMAIL)) || (await User.findOne({ role: 'admin' }).lean());
  let seller = await byEmail(process.env.SEED_SELLER_EMAIL || process.env.EVAL_SELLER_EMAIL);
  if (!seller) {
    const s = await Seller.findOne({ isApproved: true, status: { $ne: 'suspended' } }).sort({ createdAt: 1 }).select('userId').lean();
    seller = s ? await User.findById(s.userId).lean() : null;
  }
  let customer = await byEmail(process.env.SEED_CUSTOMER_EMAIL || process.env.EVAL_CUSTOMER_EMAIL);
  if (!customer) {
    const top = await Order.aggregate([{ $group: { _id: '$customerId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 1 }]);
    customer = top[0] ? await User.findById(top[0]._id).lean() : null;
  }
  return { admin, seller, customer };
};

/**
 * Run the exam. `ask` is injectable so the runner is testable without a model.
 * @returns {Promise<{cases:number, clean:number, rows:object[], byModel:Record<string,number>}>}
 */
const runEvals = async ({ only, ask = require('./assistant').ask, users } = {}) => {
  const who = users || (await askers());
  const rows = [];
  let clean = 0;
  const byModel = {};
  for (const [role, language, question, exp] of CASES) {
    if (only && role !== only) continue;
    if (!who[role]) {
      rows.push({ role, language, question, model: 'SKIPPED', ms: 0, words: 0, problems: [`no ${role} account to ask as`] });
      continue;
    }
    const t = Date.now();
    let r;
    try {
      r = await ask({ role, user: who[role], question, language });
    } catch (err) {
      r = { ok: false, reason: err.message };
    }
    const ms = Date.now() - t;
    if (!r || !r.ok) {
      rows.push({ role, language, question, model: 'FAILED', ms, words: 0, problems: [String(r?.reason || 'no answer').slice(0, 120)] });
      continue;
    }
    const model = String(r.model || '').replace('openai/', '').replace('groq/', '');
    byModel[model] = (byModel[model] || 0) + 1;
    const problems = grade(r.answer, exp);
    if (!problems.length) clean += 1;
    rows.push({ role, language, question, model, ms, words: words(r.answer), calls: (r.calls || []).join(','), problems, answer: process.env.SHOW ? r.answer : undefined });
  }
  return { cases: rows.length, clean, rows, byModel };
};

/** Run and keep the result - the scheduled job. */
const runAndSave = async (opts = {}) => {
  const r = await runEvals(opts);
  const doc = await EvalRun.create({
    at: new Date(),
    cases: r.cases,
    clean: r.clean,
    byModel: r.byModel,
    rows: r.rows.map(({ role, language, question, model, ms, words: w, problems }) => ({ role, language, question, model, ms, words: w, problems })),
  });
  return { id: doc._id, cases: r.cases, clean: r.clean, byModel: r.byModel, failing: r.rows.filter((x) => x.problems.length).map((x) => `${x.role}/${x.language}: ${x.problems.join('; ')}`) };
};

module.exports = { CASES, grade, runEvals, runAndSave, askers, FILLER };
