/**
 * Material and highlights on a product (21 Sep 2026, launch night - Rajat:
 * "customer ko product ke baare me kuch pata hi nahi chalta"). Amazon's "Top
 * highlights" + "About this item"; ours is one material line and up to five
 * short bullets, cleaned the same way on create and on update.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Product = require('../models/Product');
const { cleanHighlights, cleanMaterial } = require('../utils/productDetails');

describe('cleanHighlights', () => {
  it('trims, drops blanks, keeps at most five, caps each at 90 characters', () => {
    const out = cleanHighlights(['  Nickel-free alloy ', '', 'x'.repeat(200), 'Adjustable', 'Gift box', 'Handmade', 'Seventh']);
    expect(out).toHaveLength(5);
    expect(out[0]).toBe('Nickel-free alloy');
    expect(out[1]).toHaveLength(90);
  });
  it('accepts one string with line breaks and strips bullet marks', () => {
    expect(cleanHighlights('• Nickel-free\n- Adjustable\n* Gift box')).toEqual(['Nickel-free', 'Adjustable', 'Gift box']);
  });
  it('is an empty list for nothing', () => {
    expect(cleanHighlights(undefined)).toEqual([]);
    expect(cleanHighlights(42)).toEqual([]);
  });
});

describe('the schema', () => {
  it('holds material and highlights and refuses a sixth bullet', () => {
    const p = new Product({ name: 'Kundan set', description: 'x', price: 100, stock: 1, material: 'Brass, kundan stones', highlights: ['a', 'b'] });
    expect(p.validateSync()?.errors?.highlights).toBeUndefined();
    expect(p.material).toBe('Brass, kundan stones');
    const six = new Product({ name: 'x', description: 'x', price: 1, stock: 1, highlights: ['1', '2', '3', '4', '5', '6'] });
    expect(six.validateSync()?.errors?.highlights).toBeDefined();
    expect(cleanMaterial('  Polyester blend  ')).toBe('Polyester blend');
  });
});
