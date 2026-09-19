/**
 * evalAssistant.js - does Ask ShopMaster answer the way Rajat asked for?
 *
 *   "pinpointed, no faltu baat, wholesome, kaam ka" (13 Sep 2026)
 *
 * The cases and the grader live in utils/ai/evals.js so the same exam runs
 * weekly from the scheduled job and draws the trend on /admin/ask. This is
 * the terminal view of it: run after changing the prompt or a road, compare
 * the table.
 *
 *   node evalAssistant.js            all cases
 *   node evalAssistant.js seller     one role
 *   node evalAssistant.js --save     all cases, kept as an EvalRun (the trend)
 *   SHOW=1 node evalAssistant.js     print every answer
 *
 * Costs real calls (one per case, plus tool calls). Eleven cases ≈ one
 * minute of Gemini's free budget; run it a few times a day at most.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { runEvals, runAndSave } = require('./utils/ai/evals');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const args = process.argv.slice(2);
  const save = args.includes('--save');
  const only = args.find((a) => !a.startsWith('--'));
  const r = save ? await runAndSave({ only }) : await runEvals({ only });
  if (r.rows) {
    console.table(
      r.rows.map((x) => ({
        role: x.role,
        lang: x.language,
        question: x.question.slice(0, 34),
        model: x.model,
        ms: x.ms,
        words: x.words,
        calls: x.calls || '',
        problems: x.problems.join('; ') || 'ok',
      }))
    );
    if (process.env.SHOW) for (const x of r.rows) if (x.answer) console.log(`\n--- ${x.question}\n${x.answer}\n`);
  } else {
    console.log(r);
  }
  console.log(`\n${r.clean}/${r.cases} clean`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
