/**
 * What the gate said about a LIVE answer is kept (3 Oct 2026).
 *
 * OFFLINE AND ONLINE ARE DIFFERENT EXAMS
 *   The weekly eval (plan 2.23) is an OFFLINE one: eleven fixed questions,
 *   graded by code, run against a frozen set. It tells us whether a prompt
 *   change made things better in the lab. It cannot tell us what real people
 *   are actually being told, because it never sees a real question.
 *
 *   The ONLINE half was already two-thirds built and nobody noticed. Every
 *   answer a person gets is judged by `answerGate` on its way out - invented
 *   order numbers, refusals while tools existed, filler, markdown, length -
 *   and `AssistLog` already keeps the question, the answer, the model, the
 *   tools called, the passages retrieved, the time taken, and the reader's own
 *   thumb (`helpful`). The one thing thrown away was the verdict.
 *
 *   So a run of bad answers in production was invisible unless somebody read a
 *   hundred log rows by hand. Keeping two fields that are already computed
 *   turns the log into evaluation on live traffic: which answers the gate had
 *   to repair, and whether those are the ones that had nothing to read.
 *
 * NOT A BLOCKER, A RECORD
 *   Nothing here changes what the person is told - the gate already decided
 *   that before this line runs. This only stops the reason being forgotten.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const AssistLog = require('../models/AssistLog');
const assistant = require('../utils/ai/assistant');
const controller = require('../controllers/assistController');

const res = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  return r;
};
const req = () => ({ user: { _id: 'u1' }, body: { question: 'Mera payout kab aayega?' } });

const originals = {};
let logged;

beforeEach(() => {
  originals.create = AssistLog.create;
  originals.ask = assistant.ask;
  logged = null;
  AssistLog.create = vi.fn(async (doc) => ((logged = doc), { _id: 'log1' }));
});

afterEach(() => {
  AssistLog.create = originals.create;
  assistant.ask = originals.ask;
});

describe('the live answer log', () => {
  it('keeps the gate verdict beside the answer it judged', async () => {
    assistant.ask = vi.fn(async () => ({
      ok: true,
      answer: 'Friday ko ₹1,240 aayega. /seller/payments',
      language: 'hg',
      model: 'gemini-3.5-flash',
      calls: ['payoutState'],
      ms: 900,
      quality: ['too long (430 words)', 'invented order SMP-260901-ZZZZZZ'],
      evidence: { via: 'both', chunks: 6 },
    }));

    await controller.seller(req(), res());

    expect(logged.quality).toEqual(['too long (430 words)', 'invented order SMP-260901-ZZZZZZ']);
  });

  it('keeps how much evidence that answer had, so the two can be read together', async () => {
    assistant.ask = vi.fn(async () => ({
      ok: true, answer: 'A', language: 'en', model: 'm', calls: [], ms: 1,
      quality: [], evidence: { via: 'none', chunks: 0 },
    }));

    await controller.seller(req(), res());

    expect(logged.via).toBe('none');
    expect(logged.chunks).toBe(0);
  });

  it('a clean answer records an empty verdict, not a missing one', async () => {
    assistant.ask = vi.fn(async () => ({
      ok: true, answer: 'A', language: 'en', model: 'm', calls: [], ms: 1,
      evidence: { via: 'vector', chunks: 4 },
    }));

    await controller.seller(req(), res());

    expect(logged.quality).toEqual([]);
  });

  it('an answer that never came invents neither verdict nor evidence', async () => {
    assistant.ask = vi.fn(async () => ({ ok: false, reason: 'quota' }));

    const r = res();
    await controller.seller(req(), r);

    expect(r.statusCode).toBe(503);
    expect(logged.ok).toBe(false);
    expect(logged.quality).toEqual([]);
    expect(logged.via).toBeUndefined();
  });
});
