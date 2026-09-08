/**
 * Sizes, and the thread that ties them together.
 *
 * WHY THIS SHAPE
 *   Google models a variant as a SEPARATE item in the feed with its own id,
 *   grouped by `item_group_id`. Following that exactly meant each size stays
 *   its own product row - so the cart, stock reservation, orders and payouts,
 *   all of which are keyed on a product id, did not have to change at all.
 *
 * WHAT WOULD BREAK WITHOUT THESE TESTS
 *   `size` missing from the feed is not a warning - Google DISAPPROVES Clothing
 *   (1604) and Shoes (187) without it, so a clothing seller's whole catalogue
 *   goes dark for free listings. And `item_group_id` sent for a product with no
 *   siblings tells Google there is a group where there is not one.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Product = require('../models/Product');

const build = (extra) =>
  new Product({
    name: 'Cotton Kurta',
    description: 'A plain cotton kurta, cut straight, with a mandarin collar.',
    category: '6a93cf86fbb4f39f4a6d55dc',
    price: 799,
    stock: 4,
    sellerId: '6a93cf88fbb4f39f4a6d5618',
    ...extra,
  });

describe('the size a customer reads on the label', () => {
  it('is kept as written', () => {
    expect(build({ size: 'M' }).size).toBe('M');
    expect(build({ size: '38' }).size).toBe('38');
    expect(build({ size: 'Free Size' }).size).toBe('Free Size');
  });

  it('is absent for the jewellery this shop started with', () => {
    // Google asks for size on Clothing and Shoes only. An invented "Free Size"
    // on a nose pin is noise in the feed, not compliance.
    expect(build({}).size).toBeUndefined();
  });

  it('refuses an internal code long enough to be one', () => {
    const product = build({ size: 'SMALL-RED-COTTON-KURTA-VARIANT-01-2026' });
    expect(product.validateSync()?.errors?.size).toBeTruthy();
  });
});

describe('the group that makes three rows one product', () => {
  it('holds whatever string the seller grouped them by', () => {
    const group = '6a93cf86fbb4f39f4a6d55dc';
    expect(build({ variantGroupId: group }).variantGroupId).toBe(group);
  });

  it('is null when a product stands alone', () => {
    // Sent to Google only when set - a group of one is not a group, and
    // claiming otherwise tells Google there are siblings it cannot find.
    expect(build({}).variantGroupId).toBeNull();
  });

  it('can be cleared, because a size gets attached to the wrong style', () => {
    const product = build({ variantGroupId: 'g1' });
    product.variantGroupId = null;
    expect(product.validateSync()).toBeUndefined();
    expect(product.variantGroupId).toBeNull();
  });
});
