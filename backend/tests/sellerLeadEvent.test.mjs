/**
 * A seller application is counted where the launch film can see it (19 Oct 2026).
 *
 * GA4 already counted the buyer funnel and reads UTM tags on its own, so a
 * buyer brought by an Instagram post is traceable. A SELLER was not: /sell
 * sent nothing when an application went in. The film's first goal is seller
 * recruitment, so without this event nobody can say whether it worked.
 *
 * `generate_lead` is GA4's recommended event for exactly this, and `Lead` is
 * Meta's standard one - so a future "get sellers" ad has an audience to learn
 * from on day one, the same reasoning as the four ecommerce events.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const load = async () => {
  vi.resetModules();
  return import('../../web/src/lib/analytics.js');
};

describe('sellerApplied', () => {
  const saved = {};
  beforeEach(() => {
    saved.env = { ...process.env };
    saved.window = globalThis.window;
    globalThis.window = { gtag: vi.fn(), fbq: vi.fn() };
  });
  afterEach(() => {
    process.env = saved.env;
    globalThis.window = saved.window;
  });

  it('tells GA4 and Meta that a seller applied, without any personal detail', async () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-TEST';
    process.env.NEXT_PUBLIC_META_PIXEL_ID = '123';
    const { sellerApplied } = await load();

    sellerApplied({ gstMode: 'enrolment', phone: '9876543210', pan: 'ABCDE1234F' });

    expect(window.gtag).toHaveBeenCalledWith('event', 'generate_lead', { lead_type: 'seller_application', gst_mode: 'enrolment' });
    expect(window.fbq).toHaveBeenCalledWith('track', 'Lead', { content_category: 'seller_application' }, undefined);
    expect(JSON.stringify([window.gtag.mock.calls, window.fbq.mock.calls])).not.toMatch(/9876543210|ABCDE1234F/);
  });

  it('sends nothing when no ID is set - localhost and a fresh clone stay silent', async () => {
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
    const { sellerApplied } = await load();

    sellerApplied({ gstMode: 'none' });

    expect(window.gtag).not.toHaveBeenCalled();
    expect(window.fbq).not.toHaveBeenCalled();
  });
});
