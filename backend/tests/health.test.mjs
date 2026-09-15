/** /api/health says whether the database answers, not merely whether the process does (15 Sep 2026). */
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import request from 'supertest';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const app = require('../app');

const original = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(mongoose.connection), 'readyState') || null;
afterEach(() => {
  delete mongoose.connection.readyState;
  if (mongoose.connection.db && mongoose.connection.db.__fake) delete mongoose.connection.db;
});

describe('GET /api/health', () => {
  it('is 503 with the reason when Mongo is not connected (the test environment)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ ok: false, db: 'down' });
    expect(res.body.reason).toMatch(/readyState/);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('is 200 with the ping time when Mongo answers', async () => {
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
    Object.defineProperty(mongoose.connection, 'db', { value: { __fake: true, admin: () => ({ ping: async () => ({ ok: 1 }) }) }, configurable: true });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, db: 'up' });
    expect(typeof res.body.ms).toBe('number');
  });

  it('is 503 when the ping hangs', async () => {
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
    Object.defineProperty(mongoose.connection, 'db', { value: { __fake: true, admin: () => ({ ping: () => new Promise(() => {}) }) }, configurable: true });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.reason).toMatch(/timed out/);
  }, 5000);
});
void original;
