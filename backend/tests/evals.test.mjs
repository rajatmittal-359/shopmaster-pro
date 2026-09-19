/**
 * The assistant's exam as a module (plan 2.23): the grader's rules, a runner
 * that works with any `ask`, and a saved run for the trend.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const EvalRun = require('../models/EvalRun');
const evals = require('../utils/ai/evals');

describe('grade', () => {
  it('passes a short, on-script answer with the required number and a next step', () => {
    expect(evals.grade('Aapka payout ₹1,240 Friday ko aayega. Dekhein /seller/payments', { script: 'hg', must: [/₹/], nextStep: true, maxWords: 140 })).toEqual([]);
  });
  it('names each rule an answer breaks', () => {
    const p = evals.grade('Great question! I hope this helps 😊', { script: 'hg', must: [/₹/], nextStep: true, maxWords: 3 });
    expect(p.join(' | ')).toMatch(/script/);
    expect(p.join(' | ')).toMatch(/filler/);
    expect(p.join(' | ')).toMatch(/words > 3/);
    expect(p.join(' | ')).toMatch(/no next step/);
    expect(p.join(' | ')).toMatch(/missing/);
  });
  it('objects to a page path in small talk', () => {
    expect(evals.grade('Theek hoon! Aap /seller/orders dekh lo', { script: 'hg', nextStep: false })).toEqual(['unasked next step in small talk']);
  });
});

describe('runEvals', () => {
  const users = { seller: { _id: 's' }, customer: { _id: 'c' }, admin: { _id: 'a' } };

  it('asks every case as the right person, grades, counts the road that answered', async () => {
    const ask = vi.fn(async ({ role, question }) => ({ ok: true, model: role === 'admin' ? 'groq/gpt-oss-120b' : 'gemini-3.5-flash', answer: `Answer to ${question} - /help ₹ 72 48 SMP-260901-ABCDEF dispute cancel 5` }));
    const r = await evals.runEvals({ ask, users });
    expect(r.cases).toBe(evals.CASES.length);
    expect(ask).toHaveBeenCalledTimes(evals.CASES.length);
    expect(ask.mock.calls[0][0]).toMatchObject({ role: 'seller', user: users.seller, language: 'hg' });
    expect(r.byModel).toEqual({ 'gemini-3.5-flash': 9, 'gpt-oss-120b': 2 });
    expect(r.rows.every((x) => Array.isArray(x.problems))).toBe(true);
  });
  it('a road that throws or refuses becomes a FAILED row, never a crash', async () => {
    const ask = vi.fn(async ({ role }) => { if (role === 'admin') throw new Error('all roads down'); return { ok: false, reason: 'quota' }; });
    const r = await evals.runEvals({ ask, users });
    expect(r.clean).toBe(0);
    expect(r.rows.filter((x) => x.model === 'FAILED')).toHaveLength(evals.CASES.length);
    expect(r.rows.find((x) => x.role === 'admin').problems[0]).toMatch(/all roads down/);
  });
  it('a missing account skips its cases and says so', async () => {
    const ask = vi.fn(async () => ({ ok: true, model: 'm', answer: 'x' }));
    const r = await evals.runEvals({ ask, users: { seller: users.seller }, only: 'customer' });
    expect(ask).not.toHaveBeenCalled();
    expect(r.rows.every((x) => x.model === 'SKIPPED')).toBe(true);
  });
});

describe('runAndSave', () => {
  afterEach(() => vi.restoreAllMocks());
  it('keeps the run for the trend and returns the failing cases in words', async () => {
    const create = vi.spyOn(EvalRun, 'create').mockImplementation(async (doc) => ({ _id: 'run1', ...doc }));
    const ask = vi.fn(async ({ question }) => ({ ok: true, model: 'gemini-3.5-flash', answer: question.includes('kavita') ? 'Great question! ' + 'la '.repeat(50) : 'Theek: /help ₹ 72 48 SMP-260901-ABCDEF dispute cancel 5' }));
    const r = await evals.runAndSave({ ask, users: { seller: { _id: 's' }, customer: { _id: 'c' }, admin: { _id: 'a' } } });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].rows[0]).not.toHaveProperty('answer');
    expect(r.id).toBe('run1');
    expect(r.failing.some((f) => /kavita|filler/.test(f) || /seller\/hg/.test(f))).toBe(true);
  });
});
