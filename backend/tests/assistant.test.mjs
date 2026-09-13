/**
 * Ask ShopMaster - the walls, not the words.
 *
 * The model's prose is not tested (it changes); what is tested is that a
 * role only hears about its own tools, that a tool scopes by the session
 * and never by the model's argument, that the knowledge search stays quiet
 * without a database, that the chunker cuts documents the way the index
 * expects, and that the Gemini tool loop feeds results back and stops.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { declarationsFor, runTool, TOOLS } = require('../utils/ai/tools');
const { retrieve, AUDIENCES } = require('../utils/ai/retrieve');
const { chunkMarkdown, commentsOf, jsxText } = require('../indexKnowledge');
const { generateWithTools } = require('../utils/gemini');
const Order = require('../models/Order');

describe('tool walls', () => {
  it('a customer never hears of admin or seller tools', () => {
    const names = declarationsFor('customer').map((d) => d.name);
    expect(names).toContain('getOrder');
    expect(names).toContain('searchKnowledge');
    expect(names).not.toContain('platformSummary');
    expect(names).not.toContain('myPayouts');
    expect(names).not.toContain('findSeller');
  });

  it('the admin hears of everything, the seller of their own', () => {
    expect(declarationsFor('admin').map((d) => d.name)).toEqual(expect.arrayContaining(['platformSummary', 'findSeller', 'productScore']));
    const seller = declarationsFor('seller').map((d) => d.name);
    expect(seller).toEqual(expect.arrayContaining(['myPayouts', 'myPerformance', 'myRecentOrders']));
    expect(seller).not.toContain('platformSummary');
  });

  it('declarations carry no run function - nothing executable goes to Google', () => {
    for (const d of declarationsFor('admin')) expect(Object.keys(d).sort()).toEqual(['description', 'name', 'parameters']);
  });

  it('a tool outside the role is unknown, even by name', async () => {
    const r = await runTool('platformSummary', {}, { role: 'seller', user: { _id: 's1' } });
    expect(r.error).toMatch(/No tool/);
  });

  it('every tool is read-only by name', () => {
    for (const t of TOOLS) expect(t.name).not.toMatch(/create|update|delete|refund|cancel|set|book/i);
  });
});

describe('getOrder scopes by session, not by argument', () => {
  let orig;
  beforeEach(() => {
    orig = Order.findOne;
  });
  afterEach(() => {
    Order.findOne = orig;
  });

  it('a seller query carries items.sellerId from the session', async () => {
    let seen;
    Order.findOne = (filter) => {
      seen = filter;
      return { lean: async () => null, populate: () => ({ lean: async () => null }) };
    };
    const r = await runTool('getOrder', { orderNumber: 'SMP-260912-AB12CD' }, { role: 'seller', user: { _id: 'seller-1' } });
    expect(seen).toEqual({ orderNumber: 'SMP-260912-AB12CD', 'items.sellerId': 'seller-1' });
    expect(r.error).toMatch(/No order/);
  });

  it('a customer query carries customerId; a bad number never reaches the database', async () => {
    let called = false;
    Order.findOne = (filter) => {
      called = true;
      expect(filter.customerId).toBe('cust-1');
      return { lean: async () => null };
    };
    const bad = await runTool('getOrder', { orderNumber: 'drop table' }, { role: 'customer', user: { _id: 'cust-1' } });
    expect(bad.error).toMatch(/not an order number/);
    expect(called).toBe(false);
    await runTool('getOrder', { orderNumber: 'smp-260912-ab12cd' }, { role: 'customer', user: { _id: 'cust-1' } });
    expect(called).toBe(true);
  });

  it('a seller sees only their own lines of a shared order', async () => {
    Order.findOne = () => ({
      lean: async () => ({
        orderNumber: 'SMP-260912-AB12CD',
        createdAt: '2026-09-12',
        paymentMethod: 'cod',
        paymentStatus: 'pending',
        items: [
          { sellerId: 'me', name: 'Jhumka', quantity: 1, price: 500 },
          { sellerId: 'other', name: 'Secret Saree', quantity: 1, price: 9000 },
        ],
        fulfilments: [
          { sellerId: 'me', status: 'shipped', awb: 'A1' },
          { sellerId: 'other', status: 'pending', awb: 'ZZ' },
        ],
      }),
    });
    const r = await runTool('getOrder', { orderNumber: 'SMP-260912-AB12CD' }, { role: 'seller', user: { _id: 'me' } });
    expect(r.order).toContain('Jhumka');
    expect(r.order).not.toContain('Secret Saree');
    expect(r.order).not.toContain('ZZ');
  });
});

describe('retrieve', () => {
  it('audiences nest: customer < seller < admin', () => {
    expect(AUDIENCES.customer).toEqual(['everyone']);
    expect(AUDIENCES.seller).toEqual(['everyone', 'seller']);
    expect(AUDIENCES.admin).toContain('admin');
  });

  it('is silent, not hanging, without a database', async () => {
    const r = await retrieve('payout kab', 'seller');
    expect(r).toEqual({ chunks: [], via: 'none' });
  });
});

describe('chunking', () => {
  it('splits markdown on headings and keeps the heading as title', () => {
    const md = `# Title\n\nintro that is long enough to keep as a chunk of its own, honestly it is, with a few more words.\n\n## Payouts\n\nPayout releases seven days after delivery, once the return window closes, to the bank on file.\n\n## Tiny\n\nshort`;
    const out = chunkMarkdown(md, 'X.md');
    expect(out.map((c) => c.title)).toEqual(['Title', 'Payouts']);
    expect(out[1].text.startsWith('Payouts\n\n')).toBe(true);
  });

  it('keeps block comments and runs of line comments, drops code', () => {
    const src = `/**\n * WHY: money is per seller, and this is where that rule lives in the code base.\n */\nconst secret = 'sk-live-123';\n// one\n// two\n// three lines together\n\n// lonely\n`;
    const c = commentsOf(src);
    expect(c).toContain('money is per seller');
    expect(c).toContain('one two three lines together');
    expect(c).not.toContain('lonely');
    expect(c).not.toContain('sk-live');
  });

  it('reads the prose out of a JSX page and the copy out of its data arrays', () => {
    const src = `const QA = [['When do I get paid?', 'Seven days after delivery - the return window.']];\nexport default function P() {\n  return (\n    <Section title="Returns after delivery">\n      <p>You have <strong>{POLICY.returnDays} days</strong> to start a return.</p>\n    </Section>\n  );\n}`;
    const t = jsxText(src);
    expect(t).toContain('Returns after delivery');
    expect(t).toContain('to start a return');
    expect(t).toContain('Seven days after delivery');
    expect(t).not.toContain('<p>');
    expect(t).not.toContain('POLICY');
  });
});

describe('generateWithTools', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.GEMINI_API_KEY;
  });

  it('feeds a function result back and returns the final text', async () => {
    process.env.GEMINI_API_KEY = 'test';
    const bodies = [];
    global.fetch = vi.fn(async (url, init) => {
      bodies.push(JSON.parse(init.body));
      const n = bodies.length;
      const json = n === 1
        ? { candidates: [{ content: { parts: [{ functionCall: { name: 'myPayouts', args: {} }, thoughtSignature: 'sig' }] } }] }
        : { candidates: [{ content: { parts: [{ text: 'Your payout is ₹1,250 on 18 Sept.' }] } }] };
      return { ok: true, json: async () => json };
    });
    const run = vi.fn(async () => ({ payableNow: '₹1,250' }));
    const r = await generateWithTools([{ role: 'user', parts: [{ text: 'payout?' }] }], { declarations: [{ name: 'myPayouts', description: 'x', parameters: { type: 'OBJECT', properties: {} } }], run });
    expect(r.ok).toBe(true);
    expect(r.calls).toEqual(['myPayouts']);
    expect(run).toHaveBeenCalledWith('myPayouts', {});
    // second request: the model's turn echoed whole (signature kept), then our functionResponse
    const second = bodies[1].contents;
    expect(second[1].role).toBe('model');
    expect(second[1].parts[0].thoughtSignature).toBe('sig');
    expect(second[2].parts[0].functionResponse).toEqual({ name: 'myPayouts', response: { payableNow: '₹1,250' } });
    expect(bodies[0].tools[0].functionDeclarations[0].name).toBe('myPayouts');
  });

  it('stops after maxRounds instead of looping', async () => {
    process.env.GEMINI_API_KEY = 'test';
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ functionCall: { name: 'searchKnowledge', args: { query: 'x' } } }] } }] }) }));
    const r = await generateWithTools([{ role: 'user', parts: [{ text: 'q' }] }], { declarations: [{ name: 'searchKnowledge', description: 'x', parameters: { type: 'OBJECT', properties: {} } }], run: async () => ({}), maxRounds: 2 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/never answered/);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('a 429 is reported, not retried - the caller picks the fallback road', async () => {
    process.env.GEMINI_API_KEY = 'test';
    global.fetch = vi.fn(async () => ({ ok: false, status: 429, text: async () => 'quota' }));
    const r = await generateWithTools([{ role: 'user', parts: [{ text: 'q' }] }], { run: async () => ({}) });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(429);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('groqWithTools - the second road keeps the tools', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.GROQ_API_KEY;
  });

  it('is off without a key', async () => {
    const { groqWithTools } = require('../utils/ai/groq');
    const r = await groqWithTools([{ role: 'user', parts: [{ text: 'q' }] }], { run: async () => ({}) });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/GROQ_API_KEY/);
  });

  it('translates Gemini declarations to OpenAI tools and feeds tool results back', async () => {
    process.env.GROQ_API_KEY = 'test';
    const { groqWithTools } = require('../utils/ai/groq');
    const bodies = [];
    global.fetch = vi.fn(async (url, init) => {
      bodies.push(JSON.parse(init.body));
      const json = bodies.length === 1
        ? { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'getOrder', arguments: '{"orderNumber":"SMP-260912-AB12CD"}' } }] } }] }
        : { choices: [{ message: { role: 'assistant', content: 'Shipped, arriving Monday.' } }] };
      return { ok: true, json: async () => json };
    });
    const run = vi.fn(async () => ({ order: 'shipped' }));
    const r = await groqWithTools([{ role: 'user', parts: [{ text: 'where is SMP-260912-AB12CD' }] }], {
      system: 'sys',
      declarations: [{ name: 'getOrder', description: 'x', parameters: { type: 'OBJECT', properties: { orderNumber: { type: 'STRING', description: 'n' } }, required: ['orderNumber'] } }],
      run,
    });
    expect(r.ok).toBe(true);
    expect(r.calls).toEqual(['getOrder']);
    expect(run).toHaveBeenCalledWith('getOrder', { orderNumber: 'SMP-260912-AB12CD' });
    expect(bodies[0].tools[0].function.parameters.type).toBe('object');
    expect(bodies[0].tools[0].function.parameters.properties.orderNumber.type).toBe('string');
    expect(bodies[0].messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(bodies[1].messages.at(-1)).toEqual({ role: 'tool', tool_call_id: 'c1', content: '{"order":"shipped"}' });
  });
});

describe('script detection - the English chip follows the writer', () => {
  const { detectScript } = require('../utils/ai/hinglish');
  it('tells Devanagari, Hinglish and English apart', () => {
    expect(detectScript('मेरा पेमेंट कब आएगा')).toBe('hi');
    expect(detectScript('Mereko mera payment chahiye')).toBe('hg');
    expect(detectScript('kaise ho')).toBe('hg');
    expect(detectScript('how are you')).toBe('en');
    expect(detectScript('where is order SMP-260906-858D34')).toBe('en');
  });
});

describe('Groq budget - a road that cannot fit is skipped without a call', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.GROQ_API_KEY;
  });

  it('reads the rate-limit headers and refuses the next oversized prompt locally', async () => {
    process.env.GROQ_API_KEY = 'g';
    const { groqWithTools, budget } = require('../utils/ai/groq');
    budget.clear();
    global.fetch = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'x-ratelimit-remaining-tokens': '500', 'x-ratelimit-reset-tokens': '45s', 'x-ratelimit-remaining-requests': '900', 'x-ratelimit-reset-requests': '10m' }),
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }),
    }));
    const small = [{ role: 'user', parts: [{ text: 'hi' }] }];
    expect((await groqWithTools(small, { run: async () => ({}) })).ok).toBe(true);
    const big = [{ role: 'user', parts: [{ text: 'x'.repeat(20000) }] }];
    const r = await groqWithTools(big, { run: async () => ({}) });
    expect(r.ok).toBe(false);
    expect(r.skipped).toBe(true);
    expect(r.reason).toMatch(/tokens left this minute/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    budget.clear();
  });

  it('parses Groq reset durations', () => {
    const { secondsOf } = require('../utils/ai/groq');
    expect(secondsOf('51m50.399s')).toBeCloseTo(3110.4, 1);
    expect(secondsOf('8ms')).toBeCloseTo(0.008, 3);
    expect(secondsOf('2s')).toBe(2);
  });
});
