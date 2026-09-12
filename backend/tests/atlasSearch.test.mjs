/**
 * Search that forgives, and never breaks the shop.
 *
 * The pipeline asks Atlas Search for typo-tolerant, prefix-friendly matches
 * with the name weighted above the description; when Search cannot answer
 * (index building, cluster without it) the caller gets null and falls back
 * to the regex that always worked. Results keep the relevance order.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { pipelineFor, searchProductIds, inSearchOrder, INDEX } = require('../utils/atlasSearch');

describe('the pipeline', () => {
  it('weights the name above tags above description, forgives one edit, keeps only live products', () => {
    const [search, limit, project] = pipelineFor('jhumki', { limit: 10 });
    expect(search.$search.index).toBe(INDEX);
    const should = search.$search.compound.should;
    expect(should[0].autocomplete.path).toBe('name');
    expect(should[0].autocomplete.fuzzy.maxEdits).toBe(1);
    expect(should[1].text.score.boost.value).toBeGreaterThan(should[2].text.score.boost.value);
    expect(should[3].text.path).toBe('description');
    expect(search.$search.compound.filter[0]).toEqual({ equals: { path: 'isActive', value: true } });
    expect(limit).toEqual({ $limit: 10 });
    expect(project.$project.score).toEqual({ $meta: 'searchScore' });
  });

  it('can be told which categories are browsable', () => {
    const [search] = pipelineFor('kurti', { filterIds: ['a', 'b'] });
    expect(search.$search.compound.filter[1]).toEqual({ in: { path: 'category', value: ['a', 'b'] } });
  });
});

describe('searchProductIds', () => {
  it('returns ids best-first', async () => {
    const ids = await searchProductIds('kundan', {}, { aggregate: async () => [{ _id: 'p2', score: 9 }, { _id: 'p1', score: 3 }] });
    expect(ids).toEqual(['p2', 'p1']);
  });

  it('returns null - not a throw, not [] - when Atlas Search cannot answer', async () => {
    const ids = await searchProductIds('kundan', {}, { aggregate: async () => { throw new Error('$search stage is only allowed on MongoDB Atlas'); } });
    expect(ids).toBe(null);
  });

  it('asks nothing for an empty query', async () => {
    let called = false;
    const ids = await searchProductIds('  ', {}, { aggregate: async () => { called = true; return []; } });
    expect(ids).toBe(null);
    expect(called).toBe(false);
  });
});

describe('inSearchOrder', () => {
  it('keeps the relevance order, unknowns last', () => {
    const docs = [{ _id: 'c' }, { _id: 'a' }, { _id: 'z' }, { _id: 'b' }];
    expect(inSearchOrder(docs, ['a', 'b', 'c']).map((d) => d._id)).toEqual(['a', 'b', 'c', 'z']);
  });
});
