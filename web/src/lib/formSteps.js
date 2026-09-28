/**
 * Which section of the product form is the one to be doing right now.
 *
 * WHY A SEQUENCE ONLY WHILE ADDING (28 Sep 2026, Rajat picked option A)
 *   Rajat, 26 Sep: "inme 7-8 cards chevron wale thode noisy feel dete hai."
 *   On ADD every card was shut, and because nothing is filled yet each card's
 *   summary is its empty-state nudge - "No photo yet", "Not chosen", "No
 *   price · stock?". Seven chevrons and seven sentences of advice before the
 *   seller has done anything. The summaries were not the fault; on that one
 *   screen they were the noise.
 *
 *   Baymard separate the **inline** accordion - ad-hoc open/close, no order,
 *   the one their subjects struggled with, asking "do I need to save before I
 *   open another tab?" - from the **sequential** accordion, which tested
 *   well because "users perceive accordion steps as separate pages" and each
 *   finished step collapses into what was entered. Our add flow was the
 *   inline one. This makes it the sequential one.
 *
 *   EDIT is untouched, and that is the whole point of keeping this to add.
 *   Editing is Shopify's product page - every section open, jump anywhere,
 *   change one field and save - and nobody has complained about it. A seller
 *   changing a price must never walk seven steps; NN/g say a wizard
 *   "becomes annoying and overly controlling" when used over and over, and
 *   changing a price is the definition of a repeated expert task.
 *
 * WHY IT READS THE RAIL'S OWN `done`
 *   `FormRail` already computes, per section, whether it is filled - and the
 *   rail's tick and the listing score are deliberately the same question. If
 *   this asked a second question the rail would tick a section the flow
 *   still considered unfinished, and the seller would be told two things at
 *   once. One source, or they drift.
 */

/**
 * The section the seller should be in: the first one not yet done.
 *
 * @param {Array<{id:string, done?:boolean, optional?:boolean}>} sections
 *        in the order they appear on the page
 * @returns {string|null} null when everything is done - there is no "current"
 *          step on a finished form, and opening one would be inventing work
 */
export const currentStep = (sections = []) => {
  for (const s of sections) {
    if (!s || s.optional) continue; // an optional section never becomes the step to be on
    if (!s.done) return s.id;
  }
  return null;
};

/**
 * Where one section sits relative to the current one.
 *
 * `done` collapses to its summary of what was entered (Baymard's rule);
 * `current` is open; `ahead` is shut AND says nothing, because an unfilled
 * section's summary is advice, and seven pieces of advice at once is the
 * noise this exists to remove.
 *
 * @returns {'done'|'current'|'ahead'}
 */
export const stepStateOf = (sections = [], id, current = currentStep(sections)) => {
  if (id === current) return 'current';

  const here = sections.findIndex((s) => s?.id === id);
  // A section the rail does not know about (the facts card before a category
  // is chosen) is never held back - it behaves as it always did.
  if (here < 0) return 'done';

  const now = sections.findIndex((s) => s?.id === current);
  // Everything is finished: nothing is ahead of anything.
  if (now < 0) return 'done';

  return here < now ? 'done' : 'ahead';
};
