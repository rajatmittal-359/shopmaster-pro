/**
 * A seller's category request may not hand Mongoose an object (3 Oct 2026).
 *
 * `requestCategory` took `req.body.parentCategory` straight into
 * `Category.findOne({ _id: <that>, parentCategory: null })`. Every other id in
 * this codebase goes through `isValidObjectId` first - house rule 7, "user
 * input never reaches Mongoose raw" - and this one did not.
 *
 * A seller posting `{"parentCategory": {"$ne": null}}` therefore built the
 * query `{_id: {$ne: null}, parentCategory: null}`, which matches the FIRST
 * top-level category rather than none, and that id was then stored on their
 * request. The damage is small - categories are public and an admin reads the
 * request anyway - but the shape is the one that is dangerous elsewhere, and it
 * fails silently: nothing throws, the request is created, only the parent is
 * somebody else's.
 *
 * Found while triaging CodeQL's "Database query built from user-controlled
 * sources" (WHAT-IS-LEFT 2.77). Every other instance it flagged was a false
 * positive - `_id: req.params.id` paired with a `userId`/`sellerId` the session
 * owns, after an `isValidObjectId` guard. This was the real one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const Category = require('../models/Category');
const CategoryRequest = require('../models/CategoryRequest');
const panel = require('../controllers/panelController');

const SELLER = new mongoose.Types.ObjectId();
const originals = {};
let findOneCalls;
let created;

const res = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  return r;
};

beforeEach(() => {
  originals.exists = Category.exists;
  originals.findOne = Category.findOne;
  originals.reqFindOne = CategoryRequest.findOne;
  originals.create = CategoryRequest.create;

  findOneCalls = [];
  created = null;

  Category.exists = vi.fn(async () => null);
  CategoryRequest.findOne = vi.fn(async () => null);
  Category.findOne = vi.fn((filter) => {
    findOneCalls.push(filter);
    return { lean: async () => ({ _id: new mongoose.Types.ObjectId(), name: 'Jewellery' }) };
  });
  CategoryRequest.create = vi.fn(async (doc) => ((created = doc), doc));
});

afterEach(() => {
  Category.exists = originals.exists;
  Category.findOne = originals.findOne;
  CategoryRequest.findOne = originals.reqFindOne;
  CategoryRequest.create = originals.create;
});

describe('requestCategory and the parent it is given', () => {
  it('never puts a raw object from the body into the query', async () => {
    const r = res();
    await panel.requestCategory(
      { user: { _id: SELLER }, body: { name: 'Anklets', parentCategory: { $ne: null } } },
      r
    );

    // Whatever the answer is, Mongoose must not have been handed the operator.
    for (const filter of findOneCalls) {
      expect(typeof filter._id === 'object' && filter._id !== null && !mongoose.isValidObjectId(filter._id)).toBe(false);
    }
    // And no parent may be recorded from a value we refused to trust.
    expect(created?.parentCategory ?? null).toBeNull();
  });

  it('still honours a real parent id', async () => {
    const parentId = new mongoose.Types.ObjectId();
    const r = res();
    await panel.requestCategory(
      { user: { _id: SELLER }, body: { name: 'Anklets', parentCategory: String(parentId) } },
      r
    );

    expect(findOneCalls.length).toBe(1);
    expect(String(findOneCalls[0]._id)).toBe(String(parentId));
    expect(findOneCalls[0].parentCategory).toBeNull();
    expect(r.statusCode).toBe(201);
  });

  it('a malformed id is simply no parent, not a 500', async () => {
    const r = res();
    await panel.requestCategory(
      { user: { _id: SELLER }, body: { name: 'Anklets', parentCategory: 'not-an-id' } },
      r
    );

    expect(findOneCalls.length).toBe(0);
    expect(created?.parentCategory ?? null).toBeNull();
    expect(r.statusCode).toBe(201);
  });
});
