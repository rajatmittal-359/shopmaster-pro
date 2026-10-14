/**
 * The free road to Kontext: a public ZeroGPU Space.
 *
 * WHY IT EXISTS
 *   On 14 Oct 2026 router.huggingface.co started answering 402 "You have no
 *   remaining credits" - Hugging Face gives free accounts none - and the one
 *   button promising the most faithful edit did nothing. The same model runs
 *   on black-forest-labs/FLUX.1-Kontext-Dev, and ZeroGPU Spaces are free.
 *
 * WHAT THESE TESTS HOLD
 *   The protocol, because it is three calls and not the obvious one, and
 *   because the obvious shortcut does not work: passing the photo as a URL
 *   inside the FileData was tried against the live Space first and came back
 *   `event: error, data: null`. The upload is not optional, so a test pins it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { huggingfaceSpace, spaceHost, ProviderError } = require('../utils/ai/providers');

const PNG = Buffer.from('89504e47', 'hex');
const SPACE = 'black-forest-labs/FLUX.1-Kontext-Dev';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const jsonRes = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const textRes = (body) => ({ ok: true, status: 200, text: async () => body });

describe('the Space host', () => {
  it('is the owner and name flattened to one label', () => {
    expect(spaceHost(SPACE)).toBe('https://black-forest-labs-flux-1-kontext-dev.hf.space');
  });
});

describe('huggingfaceSpace', () => {
  it('uploads the photo, starts the job, then reads the finished image', async () => {
    const calls = [];
    const resultUrl = 'https://black-forest-labs-flux-1-kontext-dev.hf.space/gradio_api/file=/tmp/gradio/x/image.webp';
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = String(url);
      calls.push(u);
      if (u.endsWith('/gradio_api/upload')) {
        expect(init.body).toBeInstanceOf(FormData);
        return jsonRes(['/tmp/gradio/abc/photo.jpg']);
      }
      if (u.endsWith('/gradio_api/call/infer')) {
        const sent = JSON.parse(init.body);
        // The uploaded path travels, not the photo and not a URL.
        expect(sent.data[0]).toEqual({ path: '/tmp/gradio/abc/photo.jpg', meta: { _type: 'gradio.FileData' } });
        expect(sent.data[1]).toBe('on white');
        return jsonRes({ event_id: 'e1' });
      }
      if (u.includes('/call/infer/e1')) {
        return textRes(`event: heartbeat\ndata: null\n\nevent: complete\ndata: [${JSON.stringify({ url: resultUrl })}, 123]\n\n`);
      }
      return { ok: true, status: 200, headers: { get: () => 'image/webp' }, arrayBuffer: async () => PNG.buffer.slice(0) };
    });

    const out = await huggingfaceSpace(SPACE, { prompt: 'on white', imageBytes: PNG });
    expect(out.mime).toBe('image/webp');
    expect(Buffer.isBuffer(out.buffer)).toBe(true);
    expect(calls[0]).toContain('/gradio_api/upload');
    expect(calls[1]).toContain('/gradio_api/call/infer');
    expect(calls[3]).toBe(resultUrl);
  });

  it('reports a job that died instead of returning nothing', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/gradio_api/upload')) return jsonRes(['/tmp/gradio/abc/photo.jpg']);
      if (u.endsWith('/gradio_api/call/infer')) return jsonRes({ event_id: 'e1' });
      return textRes('event: error\ndata: null\n\n');
    });
    await expect(huggingfaceSpace(SPACE, { prompt: 'on white', imageBytes: PNG })).rejects.toThrow(ProviderError);
  });

  it('refuses without a reference photo - Kontext edits, it does not invent', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('must not be called'); });
    await expect(huggingfaceSpace(SPACE, { prompt: 'on white' })).rejects.toThrow(/reference image/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
