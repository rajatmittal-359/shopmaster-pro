/**
 * The exam records how much EVIDENCE each answer had (3 Oct 2026).
 *
 * WHY THIS, AND WHY ONLY THIS
 *   The question that started it: should the assistant re-RETRIEVE when an
 *   answer comes out weak, the way the published "self-correcting RAG" pattern
 *   does? Today `retrieve` runs once, outside the road loop (assistant.js:158),
 *   so a gate failure moves to the next MODEL with the same passages.
 *
 *   Reading the gate settled that it cannot be built yet. Its three substance
 *   problems are `empty`, `refusal while tools exist` and `invented order` -
 *   none of them says "the evidence was thin", and all three are answered
 *   correctly by trying another model. The published pattern re-queries on a
 *   RELEVANCE SCORE, and we do not compute one. Building the loop now would be
 *   building on a guess.
 *
 *   So this records the fact instead of acting on it. `retrieve` already
 *   returns `via` (none | vector | text | both) and its chunks on every single
 *   answer - the number is computed and then thrown away. Carrying it onto the
 *   eval row costs no model call and no dependency, and the weekly eval job
 *   (Sunday 22:30 UTC) then accumulates the one table that can answer the
 *   question with evidence: do the answers that fail the grader also have thin
 *   retrieval? If they do, the loop is worth building. If they do not, this
 *   closes the idea for good.
 *
 * WHAT IS DEFENDED HERE
 *   That the number survives the journey. It is computed in assistant.js,
 *   passed through `ask`, recorded by `runEvals`, and stored by `runAndSave` -
 *   four places, and a number that is dropped at any one of them is a number
 *   nobody will ever look at.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const EvalRun = require('../models/EvalRun');
const evals = require('../utils/ai/evals');

const users = { seller: { _id: 's' }, customer: { _id: 'c' }, admin: { _id: 'a' } };

/** An `ask` that answers everything the grader wants, with the evidence it had. */
const askWith = (evidence) =>
  vi.fn(async ({ question }) => ({
    ok: true,
    model: 'gemini-3.5-flash',
    answer: `Answer to ${question} - /help ₹ 72 48 SMP-260901-ABCDEF dispute cancel 5`,
    ...(evidence === undefined ? {} : { evidence }),
  }));

describe('the evidence behind each eval answer', () => {
  it('records which retrieval road ran and how many passages it found', async () => {
    const r = await evals.runEvals({ ask: askWith({ via: 'both', chunks: 8 }), users });

    expect(r.rows.every((row) => row.via === 'both')).toBe(true);
    expect(r.rows.every((row) => row.chunks === 8)).toBe(true);
  });

  it('records an answer that had nothing to go on, rather than leaving a blank', async () => {
    const r = await evals.runEvals({ ask: askWith({ via: 'none', chunks: 0 }), users });

    expect(r.rows[0].via).toBe('none');
    expect(r.rows[0].chunks).toBe(0);
  });

  it('survives an ask that reports no evidence at all - the exam still runs', async () => {
    const r = await evals.runEvals({ ask: askWith(undefined), users });

    expect(r.cases).toBe(evals.CASES.length);
    expect(r.rows[0].via).toBeUndefined();
    expect(r.rows[0].chunks).toBeUndefined();
  });

  it('a failed road records no evidence and does not invent any', async () => {
    const ask = vi.fn(async () => ({ ok: false, reason: 'quota' }));
    const r = await evals.runEvals({ ask, users });

    expect(r.rows[0].model).toBe('FAILED');
    expect(r.rows[0].via).toBeUndefined();
  });

  describe('and it reaches the saved run, which is what the trend reads', () => {
    const original = EvalRun.create;
    afterEach(() => { EvalRun.create = original; });

    it('stores via and chunks on every row', async () => {
      let saved = null;
      EvalRun.create = vi.fn(async (doc) => ((saved = doc), doc));

      await evals.runAndSave({ ask: askWith({ via: 'vector', chunks: 3 }), users });

      expect(saved.rows.every((row) => row.via === 'vector')).toBe(true);
      expect(saved.rows.every((row) => row.chunks === 3)).toBe(true);
    });
  });
});
