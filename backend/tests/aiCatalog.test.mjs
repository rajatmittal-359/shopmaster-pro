/**
 * The catalogue and the status it reports.
 *
 * WHAT THESE TESTS DEFEND
 *   1. Every chain step names a model that exists, on a provider that
 *      exists, that can do the job the chain is for. A typo here is a
 *      provider silently skipped in production.
 *   2. The standard path never starts at the least reliable provider - the
 *      rule from section 4.16 that keeps a Pollinations outage from touching
 *      a seller's everyday button.
 *   3. Status arithmetic: a provider the ledger has marked exhausted is
 *      unavailable and says when it is back; a provider with too little left
 *      for one call of a model is unavailable for THAT model and still
 *      available for a cheaper one; a zero-cost model is unlimited.
 *
 *   The database is stubbed. Pollinations is never called.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PROVIDERS, MODELS, byId } = require('../utils/ai/catalog');
const { CHAINS } = require('../utils/ai/imageGen');
const AiProviderState = require('../models/AiProviderState');

describe('the catalogue itself', () => {
  it('every chain step is a real model that can do the chain\'s job', () => {
    for (const [job, tiers] of Object.entries(CHAINS)) {
      for (const [tier, ids] of Object.entries(tiers)) {
        for (const id of ids) {
          const m = byId[id];
          expect(m, `${job}.${tier}: ${id}`).toBeTruthy();
          expect(PROVIDERS[m.provider], `${id} provider`).toBeTruthy();
          expect(m.can, `${id} in ${job}`).toContain(job);
        }
      }
    }
  });

  it('never puts the least reliable provider first on a standard path', () => {
    const worst = Object.entries(PROVIDERS).sort((a, b) => b[1].reliability - a[1].reliability)[0][0];
    expect(byId[CHAINS.edit.standard[0]].provider).not.toBe(worst);
    expect(byId[CHAINS.generate.standard[0]].provider).not.toBe(worst);
  });

  it('gives every model a cost in its provider\'s unit and a quality band', () => {
    for (const m of MODELS) {
      expect(typeof m.cost).toBe('number');
      expect(['best', 'high', 'good', 'basic']).toContain(m.quality);
      expect(m.note.length).toBeGreaterThan(10);
    }
  });
});

describe('status', () => {
  const originals = {};
  let rows = [];

  beforeEach(() => {
    originals.find = AiProviderState.find;
    originals.updateOne = AiProviderState.updateOne;
    AiProviderState.find = vi.fn(() => ({ lean: async () => rows }));
    AiProviderState.updateOne = vi.fn(async () => ({}));
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
    process.env.CLOUDFLARE_API_TOKEN = 'tok';
    process.env.POLLINATIONS_API_KEY = 'pk';
    process.env.GEMINI_API_KEY = 'gk';
    delete process.env.HF_TOKEN;
    delete process.env.NVIDIA_API_KEY;
  });
  afterEach(() => {
    AiProviderState.find = originals.find;
    AiProviderState.updateOne = originals.updateOne;
  });

  const snap = async () => {
    const { snapshot } = require('../utils/ai/status');
    return snapshot({ live: false });
  };

  it('marks a provider the ledger says is exhausted as unavailable, with a return time', async () => {
    const exhaustedAt = new Date('2026-09-11T19:30:00Z');
    rows = [{ provider: 'cloudflare', period: AiProviderState.day(), used: 10000, exhaustedAt }];
    const s = await snap();
    expect(s.providers.cloudflare.exhausted).toBe(true);
    // Rolling 24h from the refusal, and labelled as our estimate.
    expect(new Date(s.providers.cloudflare.resetsAt).toISOString()).toBe('2026-09-12T19:30:00.000Z');
    expect(s.providers.cloudflare.resetIsEstimate).toBe(true);
    const klein = s.models.find((m) => m.id === 'cf-flux-2-klein-4b');
    expect(klein.available).toBe(false);
    expect(klein.reason).toMatch(/used up - back around/);
  });

  it('counts remaining calls per model from what is left, and disables only the ones that no longer fit', async () => {
    // 1,400 neurons left: eleven klein-4b (125 each), one klein-9b (1,364), no dev (4,200).
    rows = [{ provider: 'cloudflare', period: AiProviderState.day(), used: 8600, exhaustedAt: null }];
    const s = await snap();
    const by = Object.fromEntries(s.models.map((m) => [m.id, m]));
    expect(by['cf-flux-2-klein-4b']).toMatchObject({ available: true, remaining: 11 });
    expect(by['cf-flux-2-klein-9b']).toMatchObject({ available: true, remaining: 1 });
    expect(by['cf-flux-2-dev'].available).toBe(false);
    expect(by['cf-flux-2-dev'].reason).toMatch(/Not enough neurons/);
  });

  it('reports a provider with no key as not set up, and a zero-cost model as unlimited', async () => {
    rows = [];
    const s = await snap();
    expect(s.providers.huggingface.configured).toBe(false);
    expect(s.models.find((m) => m.id === 'hf-flux-kontext-dev')).toMatchObject({
      available: false,
      reason: 'Not set up on this server',
    });
    expect(s.models.find((m) => m.id === 'pl-flux-1-schnell').unlimited).toBe(true);
  });

  it('falls back to the last known Pollinations balance when the live call is skipped', async () => {
    rows = [{ provider: 'pollinations', period: 'all', used: 0, lastBalance: 0.5 }];
    const s = await snap();
    expect(s.providers.pollinations.remainingUnits).toBe(0.5);
    expect(s.providers.pollinations.balanceIsLive).toBe(false);
    // 0.5 pollen / 0.034 = 14 gpt-image-2 calls
    expect(s.models.find((m) => m.id === 'pl-gpt-image-2').remaining).toBe(14);
  });
});
