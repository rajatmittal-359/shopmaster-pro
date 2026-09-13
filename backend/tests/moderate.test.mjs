/**
 * The Trust queue's moderator (plan 2.22). The rules layer is what runs
 * when Groq is out, so it is the layer that must be right on its own: a
 * phone number is held every time, a complaint is never held.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { byRules, moderateText } = require('../utils/ai/moderate');

describe('byRules', () => {
  it('holds a phone number, with or without +91 and spaces', () => {
    for (const t of ['call 9876543210', '+91 98765 43210', 'mera number 98765-43210 hai']) {
      const v = byRules(t);
      expect(v.flagged, t).toBe(true);
      expect(v.categories).toContain('contact_request');
      expect(v.severity).toBe('medium');
    }
  });

  it('holds off-platform contact in Hinglish and English', () => {
    expect(byRules('seedha mujhse lo whatsapp karo sasta milega').categories).toContain('contact_request');
    expect(byRules('DM me on insta for bulk').categories).toContain('contact_request');
    expect(byRules('mail me at shop@gmail.com').categories).toContain('contact_request');
  });

  it('holds a link, and calls a link plus a number spam', () => {
    expect(byRules('buy from www.cheapjewels.in').categories).toEqual(['contact_request']);
    expect(byRules('9876543210 https://x.co/deal').categories).toEqual(expect.arrayContaining(['contact_request', 'spam']));
  });

  it('marks abuse high, in three scripts', () => {
    for (const t of ['seller chutiya hai', 'you bastard', 'यह हरामी है']) {
      const v = byRules(t);
      expect(v.categories, t).toContain('abuse');
      expect(v.severity).toBe('high');
    }
  });

  it('never holds an ordinary complaint or a shop name', () => {
    for (const t of ['bahut kharab quality, paisa barbaad', 'Late by 5 days, box was dented', 'Charming Jewels ka jhumka achha hai', 'Order number 12345 not delivered', '']) {
      const v = byRules(t);
      expect(v.flagged, t).toBe(false);
      expect(v.categories).toEqual([]);
      expect(v.severity).toBe('low');
    }
  });

  it('does not read an order number or a price as a phone', () => {
    expect(byRules('SMP-260908-E96465 for ₹1234567890').flagged).toBe(false);
    expect(byRules('paid 12345 then 67890 separately').flagged).toBe(false);
  });
});

describe('moderateText without Groq', () => {
  it('answers from the rules alone and says so', async () => {
    const v = await moderateText('whatsapp 9876543210', { context: 'review' });
    expect(v.via).toBe('rules');
    expect(v.flagged).toBe(true);
    const ok = await moderateText('lovely earrings, fast delivery', { context: 'review' });
    expect(ok).toEqual({ flagged: false, categories: [], severity: 'low', reason: '', via: 'rules' });
  });
});
