/**
 * Checking what the model wrote before it reaches a shopper.
 *
 * WHY THE OUTPUT IS CHECKED AND NOT JUST ASKED FOR
 *   The prompt forbids all of this. Two of these rules exist BECAUSE a real run
 *   broke them anyway: the model announced that a pair of stud earrings weighs
 *   20 grams (that was the parcel weight, fed to it by mistake) and opened
 *   another description with "from Charming Jewels" while the rules said not to.
 *
 *   Between asking and getting there is a model. A prompt is a request; these
 *   are the guarantee.
 *
 * WHAT THE COST OF EACH ONE IS
 *   purity claim  - imitation jewellery sold as gold. Misrepresentation under
 *                   Merchant Center's policies, and worse under consumer law
 *   unsafe HTML   - the product page renders this field with
 *                   dangerouslySetInnerHTML and does NOT sanitise it, so
 *                   anything reaching the field runs in the shopper's browser
 *   a weight      - a number we do not know, stated as though we do
 *   the shop name - copy that reads as an advert instead of a description
 *   too short     - a thin page Google will not index, which is the whole
 *                   problem this was written to fix
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const {
  promptFor,
  PURITY_CLAIMS,
  STATES_A_WEIGHT,
  mentionsBrand,
  hasOnlySafeTags,
  hasAttributes,
  wordCount,
  MIN_WORDS,
} = require('../utils/productCopy');

describe('what the model is told', () => {
  const product = {
    name: 'Antique Gold Temple Necklace',
    category: 'Necklaces & Pendants',
    price: 6800,
    weight: 0.16,
    brand: 'Charming Jewels',
  };

  it('never hands over the parcel weight', () => {
    const prompt = promptFor(product);

    // 0.16 kg is the PARCEL. Given it, the model announced the jewellery
    // weighed 160 grams - true of the box, absurd of the necklace.
    expect(prompt).not.toContain('160');
    expect(prompt).not.toMatch(/weight:/i);
  });

  it('never hands over the shop name', () => {
    const prompt = promptFor(product);

    // Given it, the model advertised with it however plainly it was told not
    // to. Withholding a fact beats forbidding its use.
    expect(prompt).not.toContain('Charming Jewels');
  });

  it('does hand over the price, which is how it knows bridal from everyday', () => {
    expect(promptFor(product)).toContain('6800');
  });

  it('says plainly that the shop sells imitation jewellery', () => {
    expect(promptFor(product)).toMatch(/IMITATION/);
  });
});

describe('claims about precious metal', () => {
  const rejected = [
    'Crafted in <strong>22 carat</strong> gold for a lifetime of wear.',
    'This hallmarked piece carries the 916 mark.',
    'Made from sterling silver with a polished finish.',
    'Set with a genuine diamond at its centre.',
    'A natural ruby anchors the design.',
    'Finished in solid gold.',
  ];

  for (const text of rejected) {
    it(`refuses: ${text.replace(/<[^>]*>/g, '').slice(0, 45)}...`, () => {
      expect(PURITY_CLAIMS.test(text)).toBe(true);
    });
  }

  const allowed = [
    'A rich antique gold-toned finish across the whole piece.',
    'Oxidised silver-toned detailing in a classic style.',
    'Stone-studded, with an emerald-toned centre stone.',
    'Imitation pearls set in a floral arrangement.',
  ];

  for (const text of allowed) {
    it(`allows: ${text.slice(0, 45)}...`, () => {
      expect(PURITY_CLAIMS.test(text)).toBe(false);
    });
  }
});

describe('stating a weight we do not know', () => {
  it('catches the exact sentence a real run produced', () => {
    expect(
      STATES_A_WEIGHT.test('These earrings have a total weight of 20 grams.')
    ).toBe(true);
  });

  it('catches it however it is abbreviated', () => {
    for (const s of ['weighs 160g', '0.5 kg in the hand', 'about 12 gm', '20 gms']) {
      expect(STATES_A_WEIGHT.test(s)).toBe(true);
    }
  });

  it('does not trip over an ordinary number', () => {
    for (const s of ['Set of 4 bangles.', 'A single stone at the centre.', 'For 2 occasions']) {
      expect(STATES_A_WEIGHT.test(s)).toBe(false);
    }
  });
});

describe('advertising the shop inside its own product copy', () => {
  it('catches the opening a real run produced', () => {
    expect(
      mentionsBrand('<p>These studs from Charming Jewels are lovely.</p>', 'Charming Jewels')
    ).toBe(true);
  });

  it('is not fooled by capitals', () => {
    expect(mentionsBrand('<p>By CHARMING JEWELS.</p>', 'Charming Jewels')).toBe(true);
  });

  it('leaves an ordinary description alone', () => {
    expect(
      mentionsBrand('<p>A charming floral ring with pearl detailing.</p>', 'Charming Jewels')
    ).toBe(false);
  });

  it('ignores a brand too short to match safely', () => {
    // A two-letter brand would match inside half the words in the language.
    expect(mentionsBrand('<p>An oxidised ring.</p>', 'CJ')).toBe(false);
  });
});

describe('HTML that reaches a shopper unsanitised', () => {
  it('allows the handful of tags a description needs', () => {
    expect(hasOnlySafeTags('<p>A ring.</p><p>With <strong>detail</strong>.</p>')).toBe(true);
    expect(hasOnlySafeTags('<ul><li>One</li><li>Two</li></ul>')).toBe(true);
  });

  it('refuses anything that can execute', () => {
    expect(hasOnlySafeTags('<p>Nice</p><script>steal()</script>')).toBe(false);
    expect(hasOnlySafeTags('<iframe src="x"></iframe>')).toBe(false);
    expect(hasOnlySafeTags('<img src=x>')).toBe(false);
  });

  it('refuses attributes, which is where onerror and href would live', () => {
    expect(hasAttributes('<p onclick="steal()">Nice</p>')).toBe(true);
    expect(hasAttributes('<p>Nice</p>')).toBe(false);
  });
});

describe('length', () => {
  it('counts words, not markup', () => {
    expect(wordCount('<p>one two three</p>')).toBe(3);
  });

  it('treats the old boilerplate as too thin to be worth indexing', () => {
    const boilerplate =
      'Antique Gold Temple Necklace - carefully selected and finished to a high standard, dispatched by Charming Jewels.';
    expect(wordCount(boilerplate)).toBeLessThan(MIN_WORDS);
  });
});
