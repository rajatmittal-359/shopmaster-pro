/**
 * Pack proof may be a VIDEO (19 Oct 2026, plan 2.83).
 *
 * The industry's first defence against "empty box" and swap-fraud returns is
 * an order-linked packing video: Meesho contests a wrong return with it,
 * Flipkart's Seller Protection takes it as the evidence. A photo shows one
 * instant; a video shows the item, the count, its condition and the label in
 * one uninterrupted take. The photo stays - the video is the stronger choice,
 * not a new obligation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const Order = require('../models/Order');
const cloudinary = require('../utils/cloudinary');
const { packProof } = require('../controllers/fairReturnsController');

const SELLER = new mongoose.Types.ObjectId();
let order;
let saved;

const call = async (body) => {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await packProof({ params: { orderId: 'o1' }, user: { _id: SELLER }, body }, res);
  return res;
};

beforeEach(() => {
  order = { fulfilments: [{ sellerId: SELLER, status: 'processing', packProof: {} }], save: vi.fn(async () => {}) };
  saved = Order.findOne;
  Order.findOne = vi.fn(async () => order);
});
afterEach(() => {
  Order.findOne = saved;
  vi.restoreAllMocks();
});

describe('a packing video as pack proof', () => {
  it('is stored on the parcel as the proof, marked as a video', async () => {
    vi.spyOn(cloudinary, 'uploadVideo').mockResolvedValue({ url: 'https://res.cloudinary.com/x/video/upload/p.mp4', publicId: 'pack/p', poster: 'https://res.cloudinary.com/x/video/upload/p.jpg', duration: 14 });

    const res = await call({ videoDataUrl: 'data:video/mp4;base64,AAAA' });

    expect(res.statusCode).toBe(200);
    expect(order.fulfilments[0].packProof).toMatchObject({ kind: 'video', url: 'https://res.cloudinary.com/x/video/upload/p.mp4', poster: 'https://res.cloudinary.com/x/video/upload/p.jpg', duration: 14 });
    expect(order.save).toHaveBeenCalled();
  });

  it('refuses a clip over 30 seconds and removes the upload', async () => {
    vi.spyOn(cloudinary, 'uploadVideo').mockResolvedValue({ url: 'u', publicId: 'pack/long', poster: 'p', duration: 95 });
    const del = vi.spyOn(cloudinary, 'deleteVideo').mockResolvedValue();

    const res = await call({ videoDataUrl: 'data:video/mp4;base64,AAAA' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/30 seconds/);
    expect(del).toHaveBeenCalledWith('pack/long');
    expect(order.save).not.toHaveBeenCalled();
  });

  it('says why when the upload itself is refused', async () => {
    vi.spyOn(cloudinary, 'uploadVideo').mockRejectedValue(new Error('Video upload failed: That video is 9.0MB. Keep it under 7MB - about 20 seconds is plenty.'));

    const res = await call({ videoDataUrl: 'data:video/mp4;base64,AAAA' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/7MB/);
  });
});
