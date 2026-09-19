/**
 * The Thursday catalogue sweep (plan 2.25/2.32, 19 Sep 2026): facts about
 * each live listing, worst first, three per seller, nothing for a clean shop.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Seller = require('../models/Seller');
const Product = require('../models/Product');
const notifier = require('../utils/notify');
const job = require('../jobs/catalogueSweep');

// A clean listing: unique name and a 50-word description per id, so only the
// fault a test injects shows up.
const LONG = 'Handmade kundan choker with matching earrings, gold-plated brass base, adjustable dori at the back, comes packed in a velvet box, wipe with a soft dry cloth after every use, keep away from perfume, water and sweat for a longer shine, ideal for weddings, receptions and festive evenings, made in Jaipur by our own karigars.';
const good = (over = {}) => {
  const id = over._id || 'p' + Math.random().toString(36).slice(2, 6);
  return {
    _id: id,
    name: `Kundan choker set ${id}`,
    description: `${LONG} Piece ${id}.`,
    images: ['a.jpg', 'b.jpg', 'c.jpg'],
    price: 1200,
    mrp: 1800,
    countryOfOrigin: 'India',
    hsn: '7117',
    gstRate: 3,
    ...over,
  };
};

describe('findings', () => {
  it('a clean catalogue has no issues', () => {
    expect(job.findings([good({ _id: 'a' }), good({ _id: 'b' })]).issues).toEqual([]);
  });
  it('names each fact, worst first', () => {
    const { issues, counts } = job.findings([
      good({ _id: 'a', images: [] }),
      good({ _id: 'b', images: ['x.jpg'], description: 'Nice earrings.' }),
      good({ _id: 'c', mrp: 900 }),
    ]);
    expect(issues.map((i) => `${i.productId}:${i.key}`)).toEqual(['a:no_photo', 'c:mrp_below_price', 'b:thin_description', 'b:one_photo']);
    expect(counts).toEqual({ no_photo: 1, mrp_below_price: 1, thin_description: 1, one_photo: 1 });
  });
  it('catches two products sharing one description, and two sharing one name - but not variants of one product', () => {
    const d = `${LONG} Shared.`;
    const { counts } = job.findings([
      good({ _id: 'a', name: 'Kundan choker', description: d }),
      good({ _id: 'b', name: 'KUNDAN  choker', description: `${d}  ` }),
      good({ _id: 'c', name: 'Silver ring', variantGroupId: 'g1' }),
      good({ _id: 'd', name: 'silver ring', variantGroupId: 'g1' }),
    ]);
    expect(counts.shared_description).toBe(2);
    expect(counts.duplicate_name).toBe(2); // a and b; c and d are variants of one product
  });
  it('asks a registered shop for HSN and rate, never an unregistered one', () => {
    const p = [good({ hsn: '', gstRate: null })];
    expect(job.findings(p, { registered: true }).counts.tax_facts_missing).toBe(1);
    expect(job.findings(p, { registered: false }).counts.tax_facts_missing).toBeUndefined();
  });
  it('the seller hears about three products at most, one line each, worst first', () => {
    const { issues } = job.findings([good({ _id: 'a', images: [] }), good({ _id: 'b', images: [], description: 'short' }), good({ _id: 'c', images: [] }), good({ _id: 'd', images: [] })]);
    const three = job.pickThree(issues);
    expect(three.map((i) => i.productId)).toEqual(['a', 'b', 'c']);
    expect(three.map((i) => i.key)).toEqual(['no_photo', 'no_photo', 'no_photo']);
  });
});

describe('sweep', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends one note per shop with issues under the growth switch, nothing to a clean shop, and one summary to the admins', async () => {
    vi.spyOn(Seller, 'find').mockImplementation(() => ({ select: () => ({ lean: async () => [
      { userId: 'u1', businessName: 'Meera Jewels', application: { gstMode: 'none' } },
      { userId: 'u2', businessName: 'Clean Shop', application: { gstMode: 'none' } },
    ] }) }));
    vi.spyOn(Product, 'find').mockImplementation((q) => ({ select: () => ({ lean: async () => (String(q.sellerId) === 'u1' ? [good({ _id: 'a', images: [] }), good({ _id: 'b' })] : [good({ _id: 'z' })]) }) }));
    const notify = vi.spyOn(notifier, 'notify').mockResolvedValue({ inApp: true });
    const admins = vi.spyOn(notifier, 'notifyAdmins').mockResolvedValue([]);
    const r = await job.sweep({ now: new Date('2026-09-24T03:35:00Z') });
    expect(r).toMatchObject({ sellers: 2, sent: 1, clean: 1, errors: 0, issues: 1, counts: { no_photo: 1 } });
    expect(notify).toHaveBeenCalledTimes(1);
    const note = notify.mock.calls[0][0];
    expect(note).toMatchObject({ userId: 'u1', role: 'seller', category: 'growth', url: '/seller/products' });
    expect(note.tag).toMatch(/^catalogue-2026-w\d+$/);
    expect(note.body).toMatch(/Kundan choker set a: No photo/);
    expect(note.mail.html).toMatch(/\/seller\/products\/a/);
    expect(admins).toHaveBeenCalledTimes(1);
    expect(admins.mock.calls[0][0].title).toMatch(/1 issue across 1 shop/);
  });
  it('a failing shop is counted and skipped, not fatal for the rest', async () => {
    vi.spyOn(Seller, 'find').mockImplementation(() => ({ select: () => ({ lean: async () => [{ userId: 'bad', businessName: 'Bad' }, { userId: 'ok', businessName: 'Ok' }] }) }));
    vi.spyOn(Product, 'find').mockImplementation((q) => ({ select: () => ({ lean: async () => { if (String(q.sellerId) === 'bad') throw new Error('boom'); return [good()]; } }) }));
    vi.spyOn(notifier, 'notify').mockResolvedValue({});
    vi.spyOn(notifier, 'notifyAdmins').mockResolvedValue([]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await job.sweep();
    expect(r).toMatchObject({ sellers: 2, errors: 1, clean: 1, sent: 0 });
  });
});
