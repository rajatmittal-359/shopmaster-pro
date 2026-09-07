/**
 * A seller creating a product must be able to give it the attributes Google
 * requires, and an editor must be able to correct them.
 *
 * THE BUG THIS DEFENDS AGAINST
 *   `color`, `gender` and `ageGroup` were added to the Product schema and to
 *   the feed, but addProduct destructured a fixed list of fields out of the
 *   request body - and those three were not on it. Mongoose then dropped them
 *   silently, because the values never reached the model at all. Every product
 *   created through the API arrived with no colour, which is a Merchant Center
 *   warning nobody sees until 17 products are sitting in "Under review".
 *
 *   Weight had the same hole, and weight is what the courier is quoted on.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Product = require('../models/Product');

/** Exactly what addProduct does with the body, minus the database. */
const buildFrom = (body) =>
  new Product({
    name: body.name,
    description: body.description,
    category: '6a93cf86fbb4f39f4a6d55dc',
    price: body.price,
    stock: body.stock,
    sellerId: '6a93cf88fbb4f39f4a6d5618',
    weight: body.weight,
    color: body.color,
    gender: body.gender,
    ageGroup: body.ageGroup,
  });

describe('the attributes Google asks for survive the trip from the form', () => {
  it('keeps colour, gender, age group and weight', () => {
    const product = buildFrom({
      name: 'Rose Gold Pearl Ring',
      description: 'A ring.',
      price: 499,
      stock: 3,
      weight: 0.25,
      color: 'Rose Gold',
      gender: 'female',
      ageGroup: 'adult',
    });

    expect(product.color).toBe('Rose Gold');
    expect(product.gender).toBe('female');
    expect(product.ageGroup).toBe('adult');
    expect(product.weight).toBe(0.25);
  });

  it('defaults gender and age group when the form did not ask', () => {
    // The schema's defaults, not the controller's - so a seller of men's
    // watches can override them rather than silently shipping "female".
    const product = buildFrom({ name: 'Kada', description: 'x', price: 1, stock: 1 });

    expect(product.gender).toBe('female');
    expect(product.ageGroup).toBe('adult');
    expect(product.color).toBeUndefined();
  });

  it('refuses a gender that is not one Google recognises', () => {
    const product = buildFrom({
      name: 'Kada',
      description: 'x',
      price: 1,
      stock: 1,
      gender: 'other',
    });

    const invalid = product.validateSync();
    expect(invalid?.errors?.gender).toBeTruthy();
  });

  it('refuses a colour longer than the field allows', () => {
    const product = buildFrom({
      name: 'Kada',
      description: 'x',
      price: 1,
      stock: 1,
      color: 'x'.repeat(101),
    });

    expect(product.validateSync()?.errors?.color).toBeTruthy();
  });
});
