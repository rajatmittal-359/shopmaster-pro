/**
 * Take the seller's own word and hand back the right one - with the evidence.
 *
 * WHY THIS EXISTS (28 Sep 2026; Rajat, 26 Sep)
 *   "Seller ko pata hota hai product kya hai, lekin self-doubt hota hai - kya
 *   yahi acha word hai market me... us chakkar me vo ghabra ke kuch nahi
 *   likhta." Spelling doubt makes a seller type NOTHING, and an empty Search
 *   words field is a listing our own Atlas Search has less to match on.
 *
 *   `Picker` has corrected a typed word since plan §4.63, with a private
 *   Levenshtein over the words already on the page. This replaces that
 *   matcher; it does not replace the idea. What it adds is the two things
 *   the old one could not do, both found by running it against the REAL
 *   600-phrase lexicon in the dev database rather than against examples:
 *
 *     - a TRANSPOSITION cost two edits, so "jhumak" for "jhumka" - the
 *       commonest typo there is - was outside a six-letter word's budget and
 *       went uncorrected. Damerau scores it one.
 *     - the briefs hold "earrings" and not "earring", so a seller typing
 *       "earing" was two edits from anything written down. Indexing the
 *       crude singular beside each word fixed that WITHOUT widening the edit
 *       budget - and widening the budget is the change that starts
 *       "correcting" words which were already right.
 *
 *   Measured on those 600 real phrases: 9 of 10 real misspellings corrected,
 *   including Rajat's own "artifcial", and 0 of 10 correctly-spelt words
 *   touched.
 *
 * WHY WE REPLACE AND NEVER KEEP BOTH
 *   Amazon tells sellers to put spelling variations in the backend Search
 *   Terms field, because that field is a raw index and a misspelling buys a
 *   match. Etsy says the opposite - "it's not necessary to include
 *   misspellings, Etsy search will redirect shoppers" - because it matches on
 *   root words. **We are Etsy, not Amazon**: our search is Atlas Search with
 *   `fuzzy: { maxEdits: 1 }` (utils/atlasSearch.js) and Google corrects
 *   spelling too. So a misspelling stored beside the right word is a wasted
 *   slot out of thirteen, never a second way to be found.
 *
 * WHY IT WOULD RATHER SAY NOTHING
 *   The feature exists to remove invented confidence, so it must not invent
 *   any. Nothing close enough means no suggestion at all and the seller's own
 *   word goes in as typed - which is what they wanted anyway. Silence is the
 *   safe failure here; a confident wrong correction is not.
 */

/**
 * Damerau-Levenshtein, capped.
 *
 * Capped because only 1 and 2 edits are ever interesting: the moment the best
 * cell in a row is past the cap, the answer cannot come back under it, so the
 * comparison stops there. Over a few hundred phrases checked on every typed
 * word, that cut-off is the difference between a field that answers as you
 * type and one that stutters - and a form that stutters is a form Mummy stops
 * using.
 */
export const distance = (a, b, cap = 2) => {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let prev2 = [];
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      // The transposition step - "jhumak" -> "jhumka" is one edit, not two.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, prev2[j - 2] + 1);
      }
      cur[j] = d;
      if (d < best) best = d;
    }
    if (best > cap) return cap + 1;
    prev2 = prev.slice();
    for (let k = 0; k <= b.length; k += 1) prev[k] = cur[k];
  }
  return prev[b.length];
};

const wordsOf = (s) => String(s || '').toLowerCase().match(/[a-z0-9]+/g) || [];

/** The same crude stemmer `familySieve` uses in backend/utils/ai/marketBrief.js. */
export const stem = (w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);

/*
 * Each form remembers whether it is the word as WRITTEN or a stem we derived,
 * because when both sit an equal distance away the written one has to win.
 * "anklett" is one edit from "anklets" (a real phrase in the lexicon) and one
 * edit from "anklet" (a form nobody has written down); correcting to the stem
 * would hand the seller our guess in place of the evidence. The stem exists
 * only to REACH a word, never to be the answer when the real one is as close.
 */
const formsOf = (phrase) => {
  const out = new Map();
  for (const w of wordsOf(phrase)) {
    out.set(w, true);
    const s = stem(w);
    if (!out.has(s)) out.set(s, false);
  }
  return out;
};

/**
 * How many edits a word of this length may be out by.
 *
 * Under five letters: none. At that length almost everything is one edit from
 * something - "ring"/"king", "gold"/"cold" - so a corrector that guesses there
 * is wrong more often than right. Five was already the line `Picker` drew, and
 * moving it is not a tuning knob: it is the difference between help and noise.
 */
export const editBudget = (w) => (w.length < 5 ? 0 : w.length <= 7 ? 1 : 2);

/*
 * Which evidence outranks which - and it is not the biggest number.
 *
 *   google  a query that reached THIS shop in Search Console. Somebody typed
 *           it and arrived here. Nothing beats that.
 *   shop    typed into our own search box (models/SearchLog).
 *   demand  India-wide Google volume, stored on MarketBrief by the weekly
 *           job. A huge number for a phrase nobody here has ever typed is a
 *           lead, not proof, which is why it sits below both of ours.
 *   family  the category's own words. No count at all, so it can only ever be
 *           the correction of last resort.
 *
 * The same order `backend/utils/googleReadiness.js` keywordEvidence uses, on
 * purpose: two rankings of the same four sources would drift apart.
 */
export const RANK = { google: 0, shop: 1, demand: 2, family: 3 };

/**
 * The closest thing in the lexicon to what was typed.
 *
 * @param {string} typed
 * @param {Array<{word:string, source?:string, count?:number, monthly?:number}>} lexicon
 * @returns {{word:string, from:string, source:string, count:number, monthly:number}|null}
 *          `word` is the corrected WORD, `from` the phrase it was found in.
 */
export const nearestWord = (typed, lexicon = []) => {
  const t = String(typed || '').trim().toLowerCase();
  const cap = editBudget(t);
  if (!cap) return null;

  let best = null;
  for (const entry of lexicon) {
    for (const [form, written] of formsOf(entry.word)) {
      // Already a word we have evidence for. Nothing to correct - and saying
      // so anyway would be the field arguing with a seller who is right,
      // which is the fastest way to make them stop reading it.
      if (form === t) return null;

      if (Math.abs(form.length - t.length) > cap) continue;
      const d = distance(t, form, cap);
      if (d > cap) continue;

      // Nearest first; then a word somebody wrote over a stem we derived;
      // then the stronger kind of evidence; then the bigger number.
      const score = [d, written ? 0 : 1, RANK[entry.source] ?? RANK.family, -(entry.count || entry.monthly || 0)];
      const beats = !best || score.some((v, i) => score.slice(0, i).every((x, k) => x === best.score[k]) && v < best.score[i]);

      if (beats) {
        best = {
          score,
          word: form,
          from: entry.word,
          source: entry.source || 'family',
          count: entry.count || 0,
          monthly: entry.monthly || 0,
        };
      }
    }
  }

  if (!best) return null;
  const { score, ...hit } = best;
  return hit;
};

/**
 * The sentence printed beside a correction.
 *
 * It says WHERE the number came from, because that is the whole difference
 * between advice a seller can weigh and a machine telling them they are
 * wrong. Our own evidence is phrased as our own - "searches that reached your
 * shop" - since a seller trusts their own buyers over a national figure, and
 * should. A source with no count says nothing about numbers rather than
 * dressing a zero up as evidence.
 */
export const evidenceLine = (hit) => {
  if (!hit) return '';
  if (hit.source === 'google' && hit.count) {
    return `buyers type this - seen ${hit.count} ${hit.count === 1 ? 'time' : 'times'} in searches that reached your shop`;
  }
  if (hit.source === 'shop' && hit.count) {
    return `searched ${hit.count} ${hit.count === 1 ? 'time' : 'times'} on this site`;
  }
  if (hit.source === 'demand' && hit.monthly) {
    return `about ${Number(hit.monthly).toLocaleString('en-IN')} searches a month on Google`;
  }
  return '';
};

/**
 * Check one word the seller typed.
 *
 * @returns {{correction:string, from:string, source:string, evidence:string}|null}
 */
export const coachWord = (typed, lexicon = []) => {
  const hit = nearestWord(typed, lexicon);
  if (!hit) return null;
  return {
    correction: hit.word,
    from: hit.from,
    source: hit.source,
    count: hit.count,
    monthly: hit.monthly,
    evidence: evidenceLine(hit),
  };
};

/**
 * What `Picker` actually holds: a list of option strings and an `evidence`
 * Map keyed by option. Turned into the lexicon shape here so the component
 * never has to know about sources and ranks.
 */
export const lexiconFrom = (options = [], evidence = null) =>
  options.map((word) => {
    const e = evidence?.get?.(word) || {};
    return { word: String(word), source: e.source, count: e.count, monthly: e.monthly };
  });
