/**
 * GET /reviews/recent (S4, 22 Sep 2026): the home page's "What customers
 * say". Defends the privacy shape (first name + initial, nothing else about
 * the buyer), the filters (stars, words, moderation, live product with a
 * photo) and the field-by-field response.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import express from 'express';
import request from 'supertest';
import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const Review = require('../models/Review');
const routes = require('../routes/reviewRoutes');

const app = express();
app.use('/api/reviews', routes);

const row = (over = {}) => ({
  _id: 'r1', rating: 5, title: 'Lovely', comment: 'Beautiful finish, arrived in two days, exactly like the photos.', createdAt: new Date('2026-09-20'),
  userId: { _id: 'u1', name: 'Priya Sharma', email: 'priya@example.com' },
  productId: { _id: 'p1', name: 'Kundan Earrings', slug: 'kundan-earrings-1', images: ['https://res.cloudinary.com/x/a.jpg'], isActive: true, isDeleted: false },
  ...over,
});

describe('recent reviews', () => {
  afterEach(() => vi.restoreAllMocks());

  it('filters on stars, words and moderation; drops dead or photo-less products; names the buyer as first name + initial', async () => {
    let filter;
    vi.spyOn(Review, 'find').mockImplementation((f) => {
      filter = f;
      return chainableQuery([
        row(),
        row({ _id: 'r2', productId: { ...row().productId, isActive: false } }),
        row({ _id: 'r3', productId: { ...row().productId, images: [] } }),
        row({ _id: 'r4', userId: { name: 'Mummy' } }),
        row({ _id: 'r5', userId: null }),
      ]);
    });
    const res = await request(app).get('/api/reviews/recent?limit=4&min=4');
    expect(res.status).toBe(200);
    expect(filter.rating).toEqual({ $gte: 4 });
    expect(filter['moderation.status']).toEqual({ $nin: ['held', 'removed'] });
    expect(filter.$expr).toBeDefined();
    expect(res.body.reviews.map((r) => r._id)).toEqual(['r1', 'r4', 'r5']);
    expect(res.body.reviews[0]).toEqual({
      _id: 'r1', rating: 5, title: 'Lovely', comment: 'Beautiful finish, arrived in two days, exactly like the photos.', by: 'Priya S.', at: '2026-09-20T00:00:00.000Z',
      product: { _id: 'p1', name: 'Kundan Earrings', slug: 'kundan-earrings-1', image: 'https://res.cloudinary.com/x/a.jpg' },
    });
    expect(res.body.reviews[1].by).toBe('Mummy');
    expect(res.body.reviews[2].by).toBe('A customer');
    expect(JSON.stringify(res.body)).not.toMatch(/example\.com|Sharma/);
    expect(res.headers['cache-control']).toMatch(/max-age=300/);
  });
});
