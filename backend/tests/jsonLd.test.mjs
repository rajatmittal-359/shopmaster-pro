/**
 * Structured data going inside a <script> tag.
 *
 * THE BUG THIS DEFENDS AGAINST
 *   Seo.jsx wrote `JSON.stringify(jsonLd)` straight into a script tag with
 *   dangerouslySetInnerHTML. JSON.stringify escapes quotes and backslashes and
 *   does NOT escape "<", so any value containing the six characters
 *   </script> closed the tag early and everything after it was parsed by the
 *   browser as ordinary HTML.
 *
 *   A product NAME goes into that JSON, and a name is free text with no markup
 *   rule on it - the description is guaranteed clean by safeHtml.js, the name
 *   never was. So a seller calling their product
 *
 *       Ring</script><script>alert(1)</script>
 *
 *   fitted inside the 100-character limit and ran their code on the product
 *   page of every shopper who opened it. Second XSS route to the same place as
 *   the description one, found while fixing that.
 *
 * The rules being defended:
 *   1. no value can close the script tag, whatever it contains
 *   2. what Google reads back is EXACTLY what was put in - an escape that
 *      changed the data would quietly corrupt the structured data instead
 *   3. U+2028 and U+2029 too: legal in JSON, line terminators in JavaScript
 */
import { describe, it, expect } from 'vitest';
import { serialiseJsonLd } from '../../frontend/src/utils/jsonLd.js';

const CLOSER = 'Ring</script><script>alert(1)</script>';

describe('escaping', () => {
  it('cannot be closed by a product name', () => {
    const out = serialiseJsonLd({ name: CLOSER });

    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<');
  });

  it('cannot be closed from anywhere in the structure', () => {
    const out = serialiseJsonLd({
      '@type': 'Product',
      brand: { '@type': 'Brand', name: '</script><img src=x onerror=alert(1)>' },
      offers: { description: ['nested', '</SCRIPT >'] },
    });

    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });

  it('escapes the ampersand as well', () => {
    // Harmless in a script tag, but it is what keeps this correct if the
    // markup is ever moved somewhere HTML-escaped instead.
    expect(serialiseJsonLd({ name: 'Bangles & Bracelets' })).not.toContain('&');
  });

  it('escapes the JavaScript line terminators', () => {
    // Legal inside JSON, but a literal line break to a JavaScript parser - so
    // a raw one here would break the script tag it sits in.
    const out = serialiseJsonLd({ name: 'a\u2028b\u2029c' });

    expect(out).not.toContain('\u2028');
    expect(out).not.toContain('\u2029');
    expect(JSON.parse(out).name).toBe('a\u2028b\u2029c');
  });
});

describe('what Google reads back', () => {
  it('is exactly what went in', () => {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: CLOSER,
      description: 'A gold-toned necklace & matching finish',
      offers: { price: 6800, priceCurrency: 'INR' },
    };

    // The point of escaping rather than stripping: the markup is safe AND the
    // structured data still says what it said.
    expect(JSON.parse(serialiseJsonLd(data))).toEqual(data);
  });

  it('survives an ordinary product untouched in meaning', () => {
    const data = { name: 'Antique Gold Temple Necklace', sku: 'CJ-ANTIQU-010' };

    expect(JSON.parse(serialiseJsonLd(data))).toEqual(data);
  });
});
