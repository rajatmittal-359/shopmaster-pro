/**
 * The image chain: which provider answers, and what happens when one says no.
 *
 * WHY THESE TESTS EXIST
 *   Every provider here is free up to a line, and the lines are different -
 *   seven a day, eighty a day, unlimited. The whole design is that a seller
 *   never sees any of that: the chain quietly moves on. These tests hold the
 *   moving-on in place, and hold the one case where it must NOT move on: a
 *   bad request is bad everywhere, and retrying it at three providers is
 *   three wasted calls and the same error.
 *
 *   No provider is ever called. Each one is a stub that either answers or
 *   throws the kind of error the real one would.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runImage, CHAINS, EDIT_PROMPTS, smallVersionOf } = require('../utils/ai/imageGen');
const { ProviderError } = require('../utils/ai/providers');

const PNG = Buffer.from('89504e47', 'hex');
const ok = (provider) => async () => ({ buffer: PNG, mime: 'image/png', _from: provider });
const refuse = (provider, kind) => async () => {
  throw new ProviderError(provider, kind, `${kind} from ${provider}`, kind === 'quota' ? 429 : 500);
};

const CLOUDINARY = 'https://res.cloudinary.com/demo/image/upload/v1/shopmaster-products/a.jpg';

const noBooks = { success: async () => {}, exhausted: async () => {} };
const deps = (over = {}) => ({
  cloudflare: ok('cloudflare'),
  pollinations: ok('pollinations'),
  nvidia: ok('nvidia'),
  huggingface: ok('huggingface'),
  fetchReference: async () => PNG,
  book: noBooks,
  ...over,
});

describe('the premium edit chain', () => {
  it('asks Hugging Face Kontext first - the most faithful edit seen in testing', async () => {
    const made = await runImage({ mode: 'clean', tier: 'premium', imageUrl: CLOUDINARY }, deps());
    expect(made.provider).toBe('huggingface');
    expect(made.model).toBe('hf-flux-kontext-dev');
    expect(made.modelLabel).toBe('FLUX.1 Kontext dev');
  });

  it('falls to gpt-image-2, then Cloudflare klein-9b, as each says quota', async () => {
    const made = await runImage(
      { mode: 'clean', tier: 'premium', imageUrl: CLOUDINARY },
      deps({ huggingface: refuse('huggingface', 'quota'), pollinations: refuse('pollinations', 'quota') })
    );
    expect(made.provider).toBe('cloudflare');
    expect(made.model).toBe('cf-flux-2-klein-9b');
    expect(made.attempts.map((a) => a.ok)).toEqual([false, false, true]);
  });

  it('keeps going through klein-4b to kontext-pro when Cloudflare neurons are spent too', async () => {
    let pollinationsCalls = 0;
    const made = await runImage(
      { mode: 'clean', tier: 'premium', imageUrl: CLOUDINARY },
      deps({
        huggingface: refuse('huggingface', 'quota'),
        cloudflare: refuse('cloudflare', 'quota'),
        pollinations: async (remote) => {
          pollinationsCalls += 1;
          if (remote === 'openai/gpt-image-2') throw new ProviderError('pollinations', 'quota', 'no pollen', 402);
          return { buffer: PNG, mime: 'image/jpeg' };
        },
      })
    );
    expect(made.model).toBe('pl-flux-kontext-pro');
    expect(pollinationsCalls).toBe(2);
    expect(made.attempts).toHaveLength(5);
  });

  it('records the cost of a success and the exhaustion of a refusal', async () => {
    const ledger = [];
    await runImage(
      { mode: 'clean', tier: 'premium', imageUrl: CLOUDINARY },
      deps({
        huggingface: refuse('huggingface', 'quota'),
        book: {
          success: async (step) => ledger.push(['ok', step.id, step.cost]),
          exhausted: async (step) => ledger.push(['out', step.id]),
        },
      })
    );
    expect(ledger).toEqual([
      ['out', 'hf-flux-kontext-dev'],
      ['ok', 'pl-gpt-image-2', 0.034],
    ]);
  });
});

describe('choosing a model by hand', () => {
  it('uses exactly that model and refuses honestly rather than substituting', async () => {
    const made = await runImage({ mode: 'clean', modelId: 'cf-flux-2-klein-4b', imageUrl: CLOUDINARY }, deps());
    expect(made.model).toBe('cf-flux-2-klein-4b');
    expect(made.attempts).toHaveLength(1);

    const err = await runImage(
      { mode: 'clean', modelId: 'cf-flux-2-klein-4b', imageUrl: CLOUDINARY },
      deps({ cloudflare: refuse('cloudflare', 'quota') })
    ).catch((e) => e);
    expect(err.statusCode).toBe(503);
    expect(err.message).toMatch(/FLUX.2 klein 4B refused/);
    expect(err.attempts).toHaveLength(1);
  });

  it('refuses a model that cannot do the job, before calling anyone', async () => {
    // schnell generates from words; it cannot take the seller's photo.
    await expect(
      runImage({ mode: 'clean', modelId: 'cf-flux-1-schnell', imageUrl: CLOUDINARY }, deps())
    ).rejects.toThrow(/cannot edit a photo/);
    await expect(runImage({ mode: 'clean', modelId: 'nope', imageUrl: CLOUDINARY }, deps())).rejects.toThrow(/unknown model/);
  });
});

describe('the standard edit chain', () => {
  it('starts at klein-4b, the eighty-a-day model, never at 9b or dev', async () => {
    // The whole reason the chains were rebalanced: the first afternoon spent
    // the day's neurons on eight FLUX.2 dev images.
    expect(CHAINS.edit.standard[0]).toBe('cf-flux-2-klein-4b');
    expect(CHAINS.edit.standard).not.toContain('cf-flux-2-dev');
    expect(CHAINS.edit.standard).not.toContain('cf-flux-2-klein-9b');
    // And never the least reliable provider as the FIRST step of any standard chain.
    expect(CHAINS.edit.standard[0].startsWith('pl-')).toBe(false);
    expect(CHAINS.generate.standard[0].startsWith('pl-')).toBe(false);
  });

  it('fetches the reference once, even when two Cloudflare steps run', async () => {
    let fetched = 0;
    await runImage(
      { mode: 'lifestyle', tier: 'premium', imageUrl: CLOUDINARY },
      deps({
        huggingface: refuse('huggingface', 'quota'),
        pollinations: refuse('pollinations', 'quota'),
        fetchReference: async () => {
          fetched += 1;
          return PNG;
        },
        cloudflare: async (remote) => {
          if (remote.endsWith('klein-9b')) throw new ProviderError('cloudflare', 'upstream', 'flaky', 500);
          return { buffer: PNG, mime: 'image/png' };
        },
      })
    );
    expect(fetched).toBe(1);
  });
});

describe('what stops the chain', () => {
  it('a bad request stops immediately with a 400 - it would be bad everywhere', async () => {
    let cloudflareCalled = false;
    await expect(
      runImage(
        { mode: 'clean', tier: 'premium', imageUrl: CLOUDINARY },
        deps({
          huggingface: refuse('huggingface', 'input'),
          cloudflare: async () => {
            cloudflareCalled = true;
            return { buffer: PNG, mime: 'image/png' };
          },
        })
      )
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(cloudflareCalled).toBe(false);
  });

  it('answers 503 with every attempt listed when the whole chain refuses', async () => {
    const err = await runImage(
      { mode: 'clean', tier: 'standard', imageUrl: CLOUDINARY },
      deps({ cloudflare: refuse('cloudflare', 'quota'), pollinations: refuse('pollinations', 'quota') })
    ).catch((e) => e);
    expect(err.statusCode).toBe(503);
    expect(err.attempts.map((a) => a.kind)).toEqual(['quota', 'quota']);
    expect(err.message).toMatch(/cloudflare\/cf-flux-2-klein-4b: quota/);
  });

  it('refuses an edit without a photo, and a generate without words, before calling anyone', async () => {
    const spy = deps({ cloudflare: async () => { throw new Error('should not be called'); } });
    await expect(runImage({ mode: 'clean' }, spy)).rejects.toThrow(/imageUrl/);
    await expect(runImage({ mode: 'generate', prompt: '   ' }, spy)).rejects.toThrow(/description/);
    await expect(runImage({ mode: 'hologram' }, spy)).rejects.toThrow(/mode/);
  });
});

describe('the prompts', () => {
  it('every edit prompt opens by forbidding changes to the product', () => {
    // Models weigh the start of a prompt heaviest; this is the instruction
    // that must never be lost. A redrawn product is worse than no picture.
    for (const build of Object.values(EDIT_PROMPTS)) {
      expect(build('kurti')).toMatch(/^Keep the exact product from image 0 completely unchanged/);
      expect(build('kurti')).toContain('kurti');
    }
  });

  it('passes the caller\'s prompt through for generate, and never an edit prompt', async () => {
    let seen;
    await runImage(
      { mode: 'generate', tier: 'standard', prompt: '  a Diwali banner  ' },
      deps({
        cloudflare: async (model, args) => {
          seen = args.prompt;
          return { buffer: PNG, mime: 'image/png' };
        },
      })
    );
    expect(seen).toBe('a Diwali banner');
  });
});

describe('the custom scene', () => {
  it("puts the seller's words after the keep-the-product rule, never instead of it", async () => {
    let seen;
    await runImage(
      { mode: 'custom', tier: 'standard', imageUrl: CLOUDINARY, productName: 'jhumkas',
        prompt: 'a model wearing them, side profile, soft evening light' },
      deps({ cloudflare: async (m, args) => { seen = args.prompt; return { buffer: PNG, mime: 'image/png' }; } })
    );
    expect(seen).toMatch(/^Keep the exact product from image 0 completely unchanged/);
    expect(seen).toContain('a model wearing them, side profile, soft evening light');
    expect(seen).toMatch(/no text or logos added/);
  });

  it('refuses a custom scene with nothing described', async () => {
    await expect(runImage({ mode: 'custom', imageUrl: CLOUDINARY, prompt: '  ' }, deps())).rejects.toThrow(/description/);
  });

  it('caps a runaway description', async () => {
    let seen;
    await runImage(
      { mode: 'custom', imageUrl: CLOUDINARY, prompt: 'x'.repeat(2000) },
      deps({ cloudflare: async (m, args) => { seen = args.prompt; return { buffer: PNG, mime: 'image/png' }; } })
    );
    expect(seen.length).toBeLessThan(900);
  });
});

describe('reference images', () => {
  it('asks Cloudinary for a version under 512px instead of resizing here', () => {
    expect(smallVersionOf(CLOUDINARY)).toBe(
      'https://res.cloudinary.com/demo/image/upload/w_500,h_500,c_limit,f_jpg,q_auto:good/v1/shopmaster-products/a.jpg'
    );
  });

  it('leaves a non-Cloudinary URL alone', () => {
    expect(smallVersionOf('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
  });
});
