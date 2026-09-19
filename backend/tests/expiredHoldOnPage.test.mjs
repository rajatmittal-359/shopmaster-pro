/**
 * Drill L3 (20 Sep 2026): an abandoned UPI screen must not leave the product
 * reading "Out of stock" - the page and the COD path sweep expired holds, and
 * the two-hourly job sweeps everything.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Order = require('../models/Order');
const reservation = require('../utils/reservation');

afterEach(() => vi.restoreAllMocks());

describe('releaseAllExpired', () => {
  it('asks for held reservations past their time and releases each', async () => {
    const find = vi.spyOn(Order, 'find').mockResolvedValue([{ _id: 'a' }, { _id: 'b' }]);
    const rel = vi.spyOn(reservation, 'releaseReservation').mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    // module-internal call: releaseAllExpired calls the local releaseReservation, so count through Order.find only
    const r = await reservation.releaseAllExpired();
    const q = find.mock.calls[0][0];
    expect(q.reservationStatus).toBe('held');
    expect(q.reservationExpiresAt.$lt).toBeInstanceOf(Date);
    expect(r.stale).toBe(2);
    rel.mockRestore();
  });
});
