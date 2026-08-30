/**
 * A small in-memory stand-in for the two collections the reservation code
 * touches, faithful in the one respect that matters: a conditional update is
 * ATOMIC.
 *
 * WHY THIS AND NOT A REAL DATABASE
 *   tests/setup.mjs deliberately points MONGO_URI at a host that is never
 *   connected: no test may reach a real database. That policy is worth keeping.
 *
 * WHY THIS IS STILL A MEANINGFUL CONCURRENCY TEST
 *   Node runs one thing at a time; interleaving happens at `await`. These
 *   doubles evaluate the filter AND apply the update in a single synchronous
 *   step with no await between them, exactly as MongoDB applies a
 *   findOneAndUpdate to a single document.
 *
 *   So if the implementation reads a document, decides in JavaScript, and
 *   writes back, two callers WILL interleave and both will succeed here - the
 *   test fails. If it issues one conditional update, only one can win.
 *
 *   What this proves: the application does not read-then-write.
 *   What it assumes: MongoDB honours single-document atomicity, which is its
 *   documented guarantee and not this project's to re-test.
 */

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Resolves a dotted path such as 'items.productId' to the values it holds. */
const valuesAt = (doc, path) => {
  const parts = path.split('.');
  let current = [doc];
  for (const part of parts) {
    const next = [];
    for (const node of current) {
      if (node == null) continue;
      if (Array.isArray(node)) {
        for (const entry of node) if (entry && entry[part] !== undefined) next.push(entry[part]);
      } else if (node[part] !== undefined) {
        next.push(node[part]);
      }
    }
    current = next;
  }
  return current;
};

const asId = (v) => (v == null ? v : String(v._id || v));

/** Supports only the operators the reservation code actually uses. */
const matchesCondition = (value, condition) => {
  if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
    if ('$gte' in condition) return Number(value) >= Number(condition.$gte);
    if ('$lt' in condition) return new Date(value) < new Date(condition.$lt);
    if ('$in' in condition) return condition.$in.some((c) => asId(c) === asId(value));
  }
  return asId(value) === asId(condition);
};

const evalExpr = (doc, expr) => {
  if (typeof expr === 'number') return expr;
  if (typeof expr === 'string' && expr.startsWith('$')) return doc[expr.slice(1)];
  if (expr && expr.$subtract) {
    const [a, b] = expr.$subtract.map((e) => evalExpr(doc, e));
    return Number(a) - Number(b);
  }
  if (expr && expr.$ifNull) {
    const [a, fallback] = expr.$ifNull;
    const v = evalExpr(doc, a);
    return v === undefined || v === null ? evalExpr(doc, fallback) : v;
  }
  if (expr && expr.$gte) {
    const [a, b] = expr.$gte.map((e) => evalExpr(doc, e));
    return Number(a) >= Number(b);
  }
  return expr;
};

const matchesFilter = (doc, filter) => {
  for (const [key, condition] of Object.entries(filter)) {
    if (key === '$expr') {
      if (!evalExpr(doc, condition)) return false;
      continue;
    }
    if (key.includes('.')) {
      const values = valuesAt(doc, key);
      if (!values.some((v) => matchesCondition(v, condition))) return false;
      continue;
    }
    if (!matchesCondition(doc[key], condition)) return false;
  }
  return true;
};

const applyUpdate = (doc, update) => {
  if (update.$inc) {
    for (const [field, delta] of Object.entries(update.$inc)) {
      doc[field] = (doc[field] || 0) + delta;
    }
  }
  if (update.$set) Object.assign(doc, update.$set);
};

/**
 * One collection of plain documents.
 *
 * Every mutating method completes synchronously before returning its promise,
 * which is what makes it atomic with respect to other awaiting callers.
 */
export class InMemoryCollection {
  constructor(docs = []) {
    this.docs = docs.map(clone);
  }

  seed(docs) {
    this.docs = docs.map(clone);
  }

  raw(id) {
    return this.docs.find((d) => asId(d._id) === asId(id));
  }

  findById(id) {
    const found = this.raw(id);
    // Mongoose queries are thenable AND fluent, so callers may chain
    // .session()/.lean() before awaiting.
    const query = Promise.resolve(found ? clone(found) : null);
    query.session = () => query;
    query.lean = () => query;
    return query;
  }

  find(filter = {}) {
    const rows = this.docs.filter((d) => matchesFilter(d, filter)).map(clone);
    // Mongoose queries are thenable and expose .session()/.lean() fluently.
    const query = Promise.resolve(rows);
    query.session = () => query;
    query.lean = () => query;
    return query;
  }

  findOne(filter = {}) {
    const found = this.docs.find((d) => matchesFilter(d, filter));
    const query = Promise.resolve(found ? clone(found) : null);
    query.session = () => query;
    query.lean = () => query;
    return query;
  }

  /** Atomic: filter is evaluated and the update applied in one step. */
  findOneAndUpdate(filter, update, options = {}) {
    const target = this.docs.find((d) => matchesFilter(d, filter));
    if (!target) return Promise.resolve(null);

    const before = clone(target);
    applyUpdate(target, update);
    return Promise.resolve(options.new ? clone(target) : before);
  }

  /** Atomic compare-and-set over a single document. */
  updateOne(filter, update) {
    const target = this.docs.find((d) => matchesFilter(d, filter));
    if (!target) return Promise.resolve({ matchedCount: 0, modifiedCount: 0 });

    applyUpdate(target, update);
    return Promise.resolve({ matchedCount: 1, modifiedCount: 1 });
  }

  create(doc) {
    const stored = clone(doc);
    this.docs.push(stored);
    return Promise.resolve(clone(stored));
  }
}

/**
 * Points a Mongoose model's query methods at an in-memory collection and
 * returns a function that puts the originals back.
 */
export const attach = (model, collection, methods) => {
  const originals = {};
  for (const name of methods) {
    originals[name] = model[name];
    model[name] = (...args) => collection[name](...args);
  }
  return () => {
    for (const [name, fn] of Object.entries(originals)) model[name] = fn;
  };
};
