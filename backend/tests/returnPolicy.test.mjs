/**
 * Fair Returns - the matrix in plan §4.39, as code that cannot drift from it.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { evaluateReturnRequest, effectiveReturnMode, defaultModeForCategoryName, receiptVerdict } = require('../utils/returnPolicy');

const h = (hours) => new Date(Date.now() - hours * 3600000);

describe('effectiveReturnMode', () => {
  it("uses the product's pick inside the category's allowance, else the category default", () => {
    expect(effectiveReturnMode({ returnMode: 'X' }, { returnMode: 'R', returnModesAllowed: ['R', 'X'] })).toBe('X');
    expect(effectiveReturnMode({ returnMode: 'N' }, { returnMode: 'R', returnModesAllowed: ['R', 'X'] })).toBe('R');
    expect(effectiveReturnMode({}, { returnMode: 'N', returnModesAllowed: ['N'] })).toBe('N');
    expect(effectiveReturnMode(null, null)).toBe('R');
  });
  it('knows the hygiene and custom categories by name', () => {
    expect(defaultModeForCategoryName('Earrings')).toBe('N');
    expect(defaultModeForCategoryName('Nose Pins')).toBe('N');
    expect(defaultModeForCategoryName('Personalised Gifts')).toBe('N');
    expect(defaultModeForCategoryName('Bangles & Bracelets')).toBe('R');
    expect(defaultModeForCategoryName('Sarees')).toBe('R');
  });
});

describe('evaluateReturnRequest', () => {
  it('a damaged item is returnable even on a no-return product - with a photo, within 48 h', () => {
    const base = { mode: 'N', kind: 'damaged', deliveredAt: h(10), amount: 900 };
    expect(evaluateReturnRequest({ ...base, evidenceCount: 0 }).ok).toBe(false);
    const ok = evaluateReturnRequest({ ...base, evidenceCount: 1 });
    expect(ok).toMatchObject({ ok: true, resolution: 'refund', customerPaysCourier: false, needsApproval: false });
    expect(evaluateReturnRequest({ ...base, evidenceCount: 1, deliveredAt: h(60) }).ok).toBe(false);
  });
  it('change of mind: refused on N, needs the tag, customer pays the courier, exchange-only on X', () => {
    expect(evaluateReturnRequest({ mode: 'N', kind: 'change_of_mind', deliveredAt: h(24), tagIntact: true }).ok).toBe(false);
    expect(evaluateReturnRequest({ mode: 'R', kind: 'change_of_mind', deliveredAt: h(24), tagIntact: false }).ok).toBe(false);
    expect(evaluateReturnRequest({ mode: 'R', kind: 'change_of_mind', deliveredAt: h(24), tagIntact: true })).toMatchObject({ ok: true, resolution: 'refund', customerPaysCourier: true });
    expect(evaluateReturnRequest({ mode: 'X', kind: 'change_of_mind', deliveredAt: h(24), tagIntact: true, resolution: 'refund' })).toMatchObject({ ok: true, resolution: 'replacement' });
  });
  it('not as described stays open past 48 h but inside the window', () => {
    expect(evaluateReturnRequest({ mode: 'N', kind: 'not_as_described', deliveredAt: h(100), evidenceCount: 1 }).ok).toBe(true);
    expect(evaluateReturnRequest({ mode: 'R', kind: 'not_as_described', deliveredAt: h(24 * 8), evidenceCount: 1 }).ok).toBe(false);
  });
  it('a wrong-item claim above the threshold needs the unboxing evidence; big amounts go to the admin', () => {
    expect(evaluateReturnRequest({ mode: 'R', kind: 'wrong', deliveredAt: h(5), amount: 2500, evidenceCount: 0 }).ok).toBe(false);
    expect(evaluateReturnRequest({ mode: 'R', kind: 'wrong', deliveredAt: h(5), amount: 6000, evidenceCount: 1 })).toMatchObject({ ok: true, needsApproval: true, adminReview: true });
  });
  it('a customer under returns_approval waits for the admin', () => {
    expect(evaluateReturnRequest({ mode: 'R', kind: 'size', deliveredAt: h(5), tagIntact: true, riskLevel: 'returns_approval' })).toMatchObject({ ok: true, needsApproval: true });
  });
});

describe('receiptVerdict', () => {
  it('a refusal without photos does not count; pack proof plus photos goes to the admin; small unproven amounts are goodwill', () => {
    expect(receiptVerdict({ sellerOk: true }).outcome).toBe('refund');
    expect(receiptVerdict({ sellerOk: false, sellerPhotos: 0 }).outcome).toBe('refund');
    expect(receiptVerdict({ sellerOk: false, sellerPhotos: 2, packProof: true, amount: 1200 }).outcome).toBe('dispute');
    expect(receiptVerdict({ sellerOk: false, sellerPhotos: 2, packProof: false, amount: 400 }).outcome).toBe('goodwill');
    expect(receiptVerdict({ sellerOk: false, sellerPhotos: 2, packProof: false, amount: 400, goodwillUsedRecently: true }).outcome).toBe('dispute');
  });
});
