import { vi } from 'vitest';
import { createRequire } from 'module';

// The order status rule lives in the model; the double reuses it rather than
// keeping a second copy that could quietly disagree.
const Order = createRequire(import.meta.url)('../../models/Order');

/**
 * Mongoose query objects are chainable and thenable. These helpers reproduce
 * just enough of that shape for the controllers under test, so the suite needs
 * no database and no in-memory MongoDB server.
 */
export function chainableQuery(result) {
  const q = {
    populate: vi.fn(() => q),
    session: vi.fn(() => q),
    select: vi.fn(() => q),
    sort: vi.fn(() => q),
    lean: vi.fn(() => q),
    limit: vi.fn(() => q),
    skip: vi.fn(() => q),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
  };
  return q;
}

/** A fake mongoose session that records how the transaction was ended. */
export function fakeSession() {
  return {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn(async () => {}),
    abortTransaction: vi.fn(async () => {}),
    endSession: vi.fn(),
  };
}

/**
 * Stand-in for a loaded Order document: plain fields plus a save() that records
 * that persistence happened, so assertions can inspect the resulting state.
 */
export function fakeOrderDoc(fields) {
  const doc = {
    ...fields,
    save: vi.fn(async function () {
      doc.__saveCount = (doc.__saveCount || 0) + 1;

      // The real model derives `status` from the fulfilments in a pre-validate
      // hook, so controllers move a seller's fulfilment and never the order's
      // status. A double that skipped this would let a controller look correct
      // here while doing nothing in production.
      if (Array.isArray(doc.fulfilments) && doc.fulfilments.length) {
        doc.status = Order.deriveStatus(doc.fulfilments);
      }
      return doc;
    }),
  };

  doc.fulfilmentFor = (sellerId) =>
    (doc.fulfilments || []).find((f) => String(f.sellerId) === String(sellerId));

  return doc;
}
