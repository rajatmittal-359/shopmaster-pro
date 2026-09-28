/**
 * The search-word coach's judgement - which is mostly about when to stay quiet.
 *
 * WHY THESE TESTS AND NOT OTHERS (28 Sep 2026)
 *   This feature exists because sellers freeze at the Search words field out
 *   of spelling doubt, so its whole value is being TRUSTED. There are two
 *   ways to lose that, and they are not symmetrical:
 *
 *     - missing a misspelling costs one word. The seller's own spelling goes
 *       in, which is what would have happened anyway.
 *     - "correcting" a word that was already right costs the feature. A
 *       seller told they are wrong about their own trade stops reading the
 *       line, and after that the correct suggestions are invisible too.
 *
 *   So the "leaves it alone" block below is the important one, and it is
 *   deliberately longer than the block that proves corrections work.
 *
 *   The fixtures are real: these words and volumes came out of the dev
 *   database's thirty MarketBriefs, which the weekly job filled from Keyword
 *   Planner. "artifcial" is Rajat's own failing word from 27 Sep.
 */
import { describe, it, expect } from 'vitest';

/*
 * Imported across the boundary, not copied. The matcher runs in the BROWSER -
 * it is what Picker calls as the seller types, and a round trip per word
 * would make the field stutter. But its judgement is the kind that has to be
 * held to examples, so it is tested here with the rest of the suite, the same
 * way web/src/lib/validate.js is.
 */
import { coachWord, nearestWord, evidenceLine, distance, editBudget } from '../../web/src/lib/searchWordCoach.js';

/** A slice of the real lexicon, with the real numbers. */
const LEXICON = [
  { word: 'jhumka', source: 'demand', monthly: 110000 },
  { word: 'kashmiri jhumka', source: 'demand', monthly: 60500 },
  { word: 'earrings', source: 'demand', monthly: 368000 },
  { word: 'silver anklets for women', source: 'demand', monthly: 74000 },
  { word: 'artificial marathi nath', source: 'demand', monthly: 110 },
  { word: 'kundan maang tikka', source: 'demand', monthly: 2400 },
  { word: 'pendants for women', source: 'demand', monthly: 60500 },
  { word: 'oxidised silver', source: 'family' },
];

describe('it corrects the word the seller actually got wrong', () => {
  it("fixes Rajat's own failing word", () => {
    // 27 Sep: he meant "artificial", typed "artifcial", and the page-only
    // corrector had nothing to offer. This is the gap that closed.
    expect(coachWord('artifcial', LEXICON).correction).toBe('artificial');
  });

  it.each([
    ['jhumkaa', 'jhumka'],
    ['anklett', 'anklets'], // the written plural, not the stem we derived from it
    ['pendent', 'pendant'],
    ['kundun', 'kundan'],
  ])('%s -> %s', (typed, expected) => {
    expect(coachWord(typed, LEXICON).correction).toBe(expected);
  });

  it('treats a transposition as one edit, not two', () => {
    // "jhumak" for "jhumka" is two letters swapped. Plain Levenshtein scores
    // that 2, which is outside a six-letter word's budget - so the commonest
    // typo of all would go uncorrected without the Damerau step.
    expect(distance('jhumak', 'jhumka')).toBe(1);
    expect(coachWord('jhumak', LEXICON).correction).toBe('jhumka');
  });

  it('reaches a singular the lexicon never stored', () => {
    // The briefs hold "earrings" and not "earring", so "earing" is two edits
    // from anything written down. Indexing the stem closes it.
    expect(coachWord('earing', LEXICON).correction).toBe('earring');
  });
});

describe('it leaves a seller who is right alone', () => {
  it.each(['jhumka', 'earrings', 'kundan', 'silver', 'pendant', 'anklets'])(
    'says nothing about %s',
    (word) => {
      expect(coachWord(word, LEXICON)).toBeNull();
    }
  );

  it('never guesses at a short word', () => {
    // Four letters is one edit from half the language - "ring"/"king",
    // "gold"/"cold". Picker draws the same line at five in the browser.
    expect(editBudget('ring')).toBe(0);
    expect(coachWord('ring', LEXICON)).toBeNull();
    expect(coachWord('rinf', LEXICON)).toBeNull();
  });

  it('says nothing rather than reaching for a far-off word', () => {
    expect(coachWord('bluetooth', LEXICON)).toBeNull();
    expect(coachWord('handbag', LEXICON)).toBeNull();
  });

  it('says nothing when there is no lexicon at all', () => {
    // A brand-new category with no brief yet. Silence, not a guess.
    expect(coachWord('artifcial', [])).toBeNull();
    expect(coachWord('artifcial')).toBeNull();
  });

  it('is not tripped by blanks or punctuation', () => {
    expect(coachWord('', LEXICON)).toBeNull();
    expect(coachWord('   ', LEXICON)).toBeNull();
    expect(coachWord(null, LEXICON)).toBeNull();
  });
});

describe('which evidence wins when two could correct the same word', () => {
  it('prefers our own buyers over a bigger national number', () => {
    const lexicon = [
      { word: 'jhumkas', source: 'google', count: 12 },
      { word: 'jhumkha', source: 'demand', monthly: 110000 },
    ];
    // 110,000 a month is the larger figure and the weaker evidence: nobody
    // typed it HERE. A Search Console query reached this shop.
    const hit = coachWord('jhumkat', lexicon);
    expect(hit.source).toBe('google');
    expect(hit.evidence).toBe('buyers type this - seen 12 times in searches that reached your shop');
  });

  it('prefers the nearer word even when the farther one has more behind it', () => {
    const lexicon = [
      { word: 'anklet', source: 'family' },
      { word: 'ankletx', source: 'demand', monthly: 999999 },
    ];
    expect(nearestWord('anklef', lexicon).word).toBe('anklet');
  });

  it('prefers a word somebody wrote over a stem we derived, whatever the numbers say', () => {
    const lexicon = [
      { word: 'bangle', source: 'family' }, // written down, no number at all
      { word: 'bangles', source: 'demand', monthly: 99999 }, // reachable only via its stem
    ];
    // "banglr" is one edit from "bangle" as written, and two from "bangles"
    // - so the only way to reach the popular one is through the stem WE
    //   invented. Correcting to that would be handing the seller our own
    //   derivation dressed up as 99,999 searches a month.
    expect(coachWord('banglr', lexicon).correction).toBe('bangle');
    expect(coachWord('banglr', lexicon).source).toBe('family');
  });

  it('breaks a genuine tie on the bigger number', () => {
    const lexicon = [
      { word: 'pendant sets', source: 'demand', monthly: 100 },
      { word: 'gold pendant', source: 'demand', monthly: 60500 },
    ];
    // Both hold "pendant" as written, both are demand, both one edit away.
    // Only the number separates them, and the phrase people search more is
    // the better thing to be corrected to.
    expect(coachWord('pendent', lexicon).from).toBe('gold pendant');
  });
});

describe('the sentence printed beside the correction', () => {
  it('counts one search as a time, not times', () => {
    expect(evidenceLine({ source: 'google', count: 1 })).toMatch(/seen 1 time in/);
    expect(evidenceLine({ source: 'shop', count: 1 })).toMatch(/searched 1 time on/);
  });

  it('writes a monthly figure the Indian way', () => {
    expect(evidenceLine({ source: 'demand', monthly: 110000 })).toContain('1,10,000');
  });

  it('says nothing at all when it has no evidence', () => {
    // Not a reassuring sentence with no fact in it: a source with no count
    // hands back an empty string, and Picker falls through to its own
    // neutral line. Inventing confidence is the thing this feature exists
    // to remove, so it must not invent any of its own.
    expect(evidenceLine({ source: 'family' })).toBe('');
    expect(evidenceLine({ source: 'google', count: 0 })).toBe('');
    expect(evidenceLine(null)).toBe('');
  });

  it('never dresses a zero up as evidence', () => {
    // A demand word whose volume came back empty must not read "about 0
    // searches a month" - that is worse than saying nothing.
    expect(evidenceLine({ source: 'demand', monthly: 0 })).not.toMatch(/0/);
  });
});
