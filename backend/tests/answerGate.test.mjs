/** The live answer gate (15 Sep 2026): what a weak road may not hand to a person. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { judge, repair } = require('../utils/ai/answerGate');
const Order = require('../models/Order');

describe('judge', () => {
  const orig = Order.find;
  afterEach(() => { Order.find = orig; });

  it('passes a plain, short, factual answer', async () => {
    Order.find = vi.fn(() => ({ select: () => ({ lean: async () => [{ orderNumber: 'SMP-260913-E9644F' }] }) }));
    const v = await judge('Your payout of ₹4,250 releases on 21 Sept, 7 days after SMP-260913-E9644F was delivered. See /seller/payments.', { role: 'seller', user: { _id: 's1' } });
    expect(v.problems).toEqual([]);
  });

  it('catches an order number that is not this person\'s', async () => {
    Order.find = vi.fn((f) => { expect(f['customerId']).toBe('c1'); return { select: () => ({ lean: async () => [] }) }; });
    const v = await judge('Your order SMP-260901-AAAAAA is on the way.', { role: 'customer', user: { _id: 'c1' } });
    expect(v.problems[0]).toMatch(/invented order SMP-260901-AAAAAA/);
    expect(v.invented).toEqual(['SMP-260901-AAAAAA']);
  });

  it('catches filler, markdown, length and a refusal while tools exist', async () => {
    const long = 'word '.repeat(270);
    expect((await judge(`## Answer\n${long} Hope this helps! 😊`, { role: 'admin', user: { _id: 'a' } })).problems).toEqual(expect.arrayContaining([expect.stringMatching(/markdown/), expect.stringMatching(/too long/), expect.stringMatching(/filler/)]));
    expect((await judge("I don't have access to your order details.", { role: 'customer', user: { _id: 'c' }, hadTools: true })).problems).toContain('refusal while tools exist');
    expect((await judge("I don't have access to your order details.", { role: 'customer', user: { _id: 'c' }, hadTools: false })).problems).toEqual([]);
  });
});

describe('repair', () => {
  it('strips markdown and filler sentences, names an invented order, caps the length', () => {
    const out = repair('### Status\nYour order SMP-260901-AAAAAA is shipped. Feel free to ask more! It reaches you by Friday.', { invented: ['SMP-260901-AAAAAA'] });
    expect(out).not.toMatch(/###|Feel free/);
    expect(out).toContain('(order number not on record - see /orders)');
    expect(out).toContain('reaches you by Friday');
    expect(repair('w '.repeat(300)).split(/\s+/).length).toBeLessThanOrEqual(241);
  });
});
