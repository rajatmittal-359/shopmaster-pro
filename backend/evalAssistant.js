/**
 * evalAssistant.js - does Ask ShopMaster answer the way Rajat asked for?
 *
 *   "pinpointed, no faltu baat, wholesome, kaam ka" (13 Sep 2026)
 *
 * A fixed set of questions across the three roles and the three languages,
 * run against the live dev database, each answer scored by CODE (no judge
 * model needed for these): the right script, no banned filler, a sensible
 * length, a next step when one is due, the numbers that must appear. Run it
 * after changing the prompt or a road, compare the table. A judge-model
 * rubric can sit on top later (WHAT-IS-LEFT 2.23); this is the floor.
 *
 *   node evalAssistant.js            all cases
 *   node evalAssistant.js seller     one role
 *
 * Costs real calls (one per case, plus tool calls). Ten cases ≈ one minute
 * of Gemini's free budget; run it a few times a day at most.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const { ask } = require('./utils/ai/assistant');
const { detectScript } = require('./utils/ai/hinglish');

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
  ['admin', 'hg', 'Charming Jewels ka performance kaisa hai?', { script: 'hg', must: [/cancel/i], maxWords: 180 }],
  ['seller', 'hg', 'Ek kavita likho baarish pe', { script: 'hg', maxWords: 40, nextStep: false, mustNot: [/baarish.*\n.*\n.*\n/] }],
  ['customer', 'en', 'What does Indian law say a marketplace must do when I complain?', { script: 'en', must: [/48|one month|30 days|grievance/i], maxWords: 160 }],
];

const words = (s) => String(s).trim().split(/\s+/).length;
const hasNextStep = (s) => /\/(seller|admin|orders|help|account)\b/.test(s);

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

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const only = process.argv[2];
  const users = {
    seller: await User.findOne({ email: 'rajatmittal6908@gmail.com' }).lean(),
    admin: await User.findOne({ email: 'rajatmittal359@gmail.com' }).lean(),
    customer: await User.findOne({ email: 'mittalabha70@gmail.com' }).lean(),
  };
  let pass = 0;
  const rows = [];
  for (const [role, language, question, exp] of CASES) {
    if (only && role !== only) continue;
    const t = Date.now();
    const r = await ask({ role, user: users[role], question, language });
    const ms = Date.now() - t;
    if (!r.ok) {
      rows.push({ role, language, question: question.slice(0, 34), model: 'FAILED', ms, words: 0, problems: r.reason.slice(0, 60) });
      continue;
    }
    const problems = grade(r.answer, exp);
    if (!problems.length) pass += 1;
    rows.push({ role, language, question: question.slice(0, 34), model: r.model.replace('openai/', '').replace('groq/', ''), ms, words: words(r.answer), calls: (r.calls || []).join(','), problems: problems.join('; ') || 'ok' });
    if (process.env.SHOW) console.log(`\n--- ${question}\n${r.answer}\n`);
  }
  console.table(rows);
  console.log(`\n${pass}/${rows.length} clean`);
  await mongoose.disconnect();
})();
