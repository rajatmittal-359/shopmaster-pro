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

/**
 * Supports only the operators this codebase actually queries with.
 *
 * A condition object may carry several operators at once
 * (`{ $ne: null, $lte: date }`), so every one present must hold.
 */
const matchesCondition = (value, condition) => {
  if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
    const ops = Object.keys(condition).filter((k) => k.startsWith('$'));
    if (ops.length > 0) {
      return ops.every((op) => {
        const operand = condition[op];
        switch (op) {
          case '$gte': return Number(value) >= Number(operand);
          case '$gt': return Number(value) > Number(operand);
          case '$lte': return new Date(value) <= new Date(operand);
          case '$lt': return new Date(value) < new Date(operand);
          case '$ne': return asId(value) !== asId(operand);
          case '$in': return operand.some((c) => asId(c) === asId(value));
          case '$exists': return (value !== undefined) === operand;
          // Used by payout's payableOrderFilter to ask whether ANY ONE entry in
          // an array satisfies several conditions at once - which is not the
          // same as each condition being met by some entry.
          case '$elemMatch':
            return Array.isArray(value) && value.some((entry) => matchesFilter(entry, operand));
          default: return false;
        }
      });
    }
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
 * A Mongoose query is thenable AND chainable. Callers may write
 * `.select(...).sort(...).lean()` in any order before awaiting, so every
 * builder method returns the same promise rather than a new object.
 *
 * The projection/ordering methods are no-ops: these tests assert on behaviour,
 * not on which fields the driver happened to return.
 */
const project = (doc, fields) => {
  if (!doc || typeof doc !== 'object') return doc;
  const keep = new Set(fields.split(/\s+/).filter(Boolean).concat('_id'));
  return Object.fromEntries(Object.entries(doc).filter(([k]) => keep.has(k)));
};

const fluent = (value) => {
  let current = value;
  const query = {
    then: (resolve, reject) => Promise.resolve(current).then(resolve, reject),
  };
  for (const name of ['session', 'lean', 'sort', 'limit', 'skip', 'populate']) {
    query[name] = () => query;
  }
  // select() is NOT a no-op. Treating it as one hid a real bug: a projection
  // that omitted a field the caller then read, which passed every test and
  // failed the moment it ran against MongoDB.
  query.select = (fields) => {
    if (typeof fields === 'string' && !fields.startsWith('-')) {
      current = Array.isArray(current)
        ? current.map((d) => project(d, fields))
        : project(current, fields);
    }
    return query;
  };
  return query;
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
    return fluent(found ? clone(found) : null);
  }

  find(filter = {}) {
    return fluent(this.docs.filter((d) => matchesFilter(d, filter)).map(clone));
  }

  findOne(filter = {}) {
    const found = this.docs.find((d) => matchesFilter(d, filter));
    return fluent(found ? clone(found) : null);
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

  /**
   * Atomic across every matched document.
   *
   * Supports the positional array form MongoDB uses to claim individual
   * subdocuments: `{ $set: { 'items.$[line].payoutId': id } }` with
   * `arrayFilters`. That is the mechanism preventing a sale being paid twice,
   * so it is modelled properly rather than approximated.
   */
  updateMany(filter, update, options = {}) {
    const targets = this.docs.filter((d) => matchesFilter(d, filter));
    let modified = 0;

    for (const doc of targets) {
      let touched = false;

      for (const [path, value] of Object.entries(update.$set || {})) {
        const positional = path.match(/^([^.]+)\.\$\[(\w+)\]\.(.+)$/);

        if (!positional) {
          doc[path] = value;
          touched = true;
          continue;
        }

        const [, arrayField, filterName, leafField] = positional;
        const arrayFilter = (options.arrayFilters || []).find((f) =>
          Object.keys(f).some((k) => k.startsWith(filterName + '.'))
        );

        for (const entry of doc[arrayField] || []) {
          if (arrayFilter) {
            const conditions = Object.fromEntries(
              Object.entries(arrayFilter).map(([k, v]) => [k.replace(filterName + '.', ''), v])
            );
            if (!matchesFilter(entry, conditions)) continue;
          }
          entry[leafField] = value;
          touched = true;
        }
      }

      if (update.$inc) {
        applyUpdate(doc, { $inc: update.$inc });
        touched = true;
      }
      if (touched) modified++;
    }

    return Promise.resolve({ matchedCount: targets.length, modifiedCount: modified });
  }

  deleteOne(filter) {
    const index = this.docs.findIndex((d) => matchesFilter(d, filter));
    if (index === -1) return Promise.resolve({ deletedCount: 0 });
    this.docs.splice(index, 1);
    return Promise.resolve({ deletedCount: 1 });
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
