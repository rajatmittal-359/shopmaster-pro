/**
 * Which card the seller should be looking at while adding a product.
 *
 * WHY THIS IS TESTED FROM HERE (28 Sep 2026)
 *   It is browser code - `ProductForm` reads it to decide which card opens -
 *   but it is the kind of logic that is wrong silently: a seller sent back to
 *   a section they finished, or held on a section they cannot finish, and
 *   nothing throws. Imported across the boundary rather than copied, the same
 *   arrangement as lib/validate.js and lib/searchWordCoach.js.
 *
 *   The ordering here is the ORDER OF THE PAGE, not of the array by accident,
 *   so the tests use a realistic section list rather than a, b, c.
 */
import { describe, it, expect } from 'vitest';

import { currentStep, stepStateOf } from '../../web/src/lib/formSteps.js';

/** The rail's own sections, in page order. `done` is the rail's tick. */
const form = (over = {}) =>
  [
    { id: 'photos', done: false },
    { id: 'words', done: false },
    { id: 'category-card', done: false },
    { id: 'facts-card', done: false },
    { id: 'price-card', done: false },
    { id: 'details', done: false },
    { id: 'faqs', done: false, optional: true },
  ].map((s) => ({ ...s, ...(over[s.id] || {}) }));

describe('the step the seller is on', () => {
  it('starts at the first section of an empty form', () => {
    expect(currentStep(form())).toBe('photos');
  });

  it('moves on as each one is finished', () => {
    expect(currentStep(form({ photos: { done: true } }))).toBe('words');
    expect(currentStep(form({ photos: { done: true }, words: { done: true } }))).toBe('category-card');
  });

  it('does not skip a gap left behind', () => {
    // Somebody fills the price first. The flow still wants the photos, which
    // is the one thing a listing cannot go up without.
    expect(currentStep(form({ 'price-card': { done: true } }))).toBe('photos');
  });

  it('never stops on an optional section', () => {
    // FAQs are badged Optional. Reaching the end and being held on them would
    // read as "you are not finished" about something that never was required.
    const all = form({
      photos: { done: true },
      words: { done: true },
      'category-card': { done: true },
      'facts-card': { done: true },
      'price-card': { done: true },
      details: { done: true },
    });
    expect(currentStep(all)).toBeNull();
  });

  it('has no current step on a finished form', () => {
    expect(currentStep([{ id: 'a', done: true }])).toBeNull();
    expect(currentStep([])).toBeNull();
    expect(currentStep()).toBeNull();
  });
});

describe('where every other card sits', () => {
  const sections = form({ photos: { done: true } }); // current = words

  it('the one being filled is current', () => {
    expect(stepStateOf(sections, 'words')).toBe('current');
  });

  it('what is finished is behind, and shows what was entered', () => {
    expect(stepStateOf(sections, 'photos')).toBe('done');
  });

  it('what has not been reached is ahead, and says nothing', () => {
    expect(stepStateOf(sections, 'category-card')).toBe('ahead');
    expect(stepStateOf(sections, 'faqs')).toBe('ahead');
  });

  it('holds nothing back once the form is finished', () => {
    // No current step: every card behaves as a finished one, summary and all.
    const all = sections.map((s) => ({ ...s, done: true }));
    for (const s of all) expect(stepStateOf(all, s.id)).toBe('done');
  });

  it('never holds back a card the rail does not know about', () => {
    // "4 · Product facts" is absent from the rail until a category is chosen.
    // Treating an unknown card as "ahead" would shut a section the seller can
    // see and cannot open.
    expect(stepStateOf(sections, 'some-card-not-in-the-rail')).toBe('done');
  });

  it('a section before the current one is never ahead, however it was filled', () => {
    // Price filled first, photos still missing: current is photos, and price
    // sits AFTER it on the page, so it is ahead - but it keeps its summary
    // because it is done. That combination is the caller's to render, and
    // the ordering answer must stay honest about the page.
    const odd = form({ 'price-card': { done: true } });
    expect(currentStep(odd)).toBe('photos');
    expect(stepStateOf(odd, 'price-card')).toBe('ahead');
  });
});
