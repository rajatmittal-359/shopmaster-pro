/** Road 4: Cloudflare Workers AI with our tools, OpenAI wire shape, no network. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { cloudflareWithTools } = require('../utils/ai/cloudflareText');

describe('cloudflareWithTools', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_AI_GATEWAY;
  });

  it('is a recorded no-op without the account or token', async () => {
    global.fetch = vi.fn();
    const r = await cloudflareWithTools([{ role: 'user', parts: [{ text: 'hi' }] }], {});
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not set/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('routes through the gateway when named, runs the tool the model asked for, returns the final text', async () => {
    process.env.CLOUDFLARE_API_TOKEN = 't';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
    process.env.CLOUDFLARE_AI_GATEWAY = 'shopmaster';
    const bodies = [];
    let n = 0;
    global.fetch = vi.fn(async (url, init) => {
      bodies.push({ url, body: JSON.parse(init.body) });
      n += 1;
      const payload = n === 1
        ? { choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'getOrder', arguments: '{"orderNumber":"SMP-1"}' } }] } }] }
        : { choices: [{ message: { role: 'assistant', content: 'SMP-1 is delivered.' } }] };
      return { ok: true, status: 200, json: async () => payload, text: async () => '' };
    });
    const run = vi.fn(async (name, args) => ({ name, args, status: 'delivered' }));
    const r = await cloudflareWithTools([{ role: 'user', parts: [{ text: 'where is SMP-1' }] }], { system: 'sys', declarations: [{ name: 'getOrder', description: 'd', parameters: { type: 'OBJECT', properties: { orderNumber: { type: 'STRING' } } } }], run });
    expect(bodies[0].url).toBe('https://gateway.ai.cloudflare.com/v1/acct/shopmaster/workers-ai/v1/chat/completions');
    expect(bodies[0].body.tools[0].function.parameters.type).toBe('object');
    expect(run).toHaveBeenCalledWith('getOrder', { orderNumber: 'SMP-1' });
    expect(bodies[1].body.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'c1' });
    expect(r).toMatchObject({ ok: true, text: 'SMP-1 is delivered.', calls: ['getOrder'] });
    expect(r.model).toMatch(/cloudflare/);
  });

  it('gives up plainly when the model loops on tools', async () => {
    process.env.CLOUDFLARE_API_TOKEN = 't';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'x', type: 'function', function: { name: 'getOrder', arguments: '{}' } }] } }] }), text: async () => '' }));
    const r = await cloudflareWithTools([{ role: 'user', parts: [{ text: 'q' }] }], { declarations: [], run: async () => ({}), maxRounds: 1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/never answered/);
  });
});
