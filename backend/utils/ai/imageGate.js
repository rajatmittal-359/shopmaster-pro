const { generate } = require('../gemini');

/**
 * The image gate (15 Sep 2026 - Rajat: "ek baar image itni bekaar aur
 * irrelevant aayi").
 *
 * An edit model that redraws the earrings is worse than no model: the
 * customer receives something other than the picture. Nothing in code can
 * see that - but Gemini flash-lite can, cheaply (two small images, one
 * short JSON answer, ~400 tokens). So every EDIT is checked: is the product
 * in the result the same item as in the seller's photo? A "no" sends the
 * job to the next model in the chain once; a second "no" is returned with
 * a warning the interface shows, never silently offered as done.
 *
 * Without a Gemini key the gate says "unchecked" and nothing is blocked -
 * the gate improves outcomes, it must never be the reason there are none.
 */
const SCHEMA = { type: 'object', properties: { sameProduct: { type: 'boolean' }, productVisible: { type: 'boolean' }, issue: { type: 'string' } }, required: ['sameProduct', 'productVisible'] };

const PROMPT = (subject) => `Image 1 is a seller's photo of a product${subject ? ` (${subject})` : ''}. Image 2 is an AI edit of that photo that was allowed to change ONLY the background, setting, lighting or camera angle.
Judge strictly:
- sameProduct: is the product in image 2 the very same item as in image 1 - same shape, same colours, same materials, same number of parts, same details? Redrawn, restyled, recoloured, extra or missing parts = false.
- productVisible: is the product clearly visible and in focus in image 2?
- issue: one short sentence on what changed, or empty.
Answer with ONE JSON object only.`;

/**
 * @param {{beforeUrl?:string, beforeDataUrl?:string, afterDataUrl:string, subject?:string}} p
 * @returns {Promise<{checked:boolean, ok:boolean, issue:string, model?:string}>}
 */
const judgeEdit = async ({ beforeUrl, beforeDataUrl, afterDataUrl, subject = '' }) => {
  if (!process.env.GEMINI_API_KEY) return { checked: false, ok: true, issue: '' };
  const r = await generate(PROMPT(subject), {
    images: [beforeDataUrl || beforeUrl, afterDataUrl],
    responseSchema: SCHEMA,
    temperature: 0,
    textModel: 'gemini',
    model: process.env.GEMINI_LITE_MODEL || 'gemini-3.5-flash-lite',
    attempts: 1,
    maxOutputTokens: 300,
  });
  if (!r.ok) return { checked: false, ok: true, issue: '' };
  try {
    const j = JSON.parse(r.text);
    const ok = Boolean(j.sameProduct) && j.productVisible !== false;
    return { checked: true, ok, issue: ok ? '' : String(j.issue || (j.productVisible === false ? 'product not clearly visible' : 'product changed')).slice(0, 160), model: r.model };
  } catch {
    return { checked: false, ok: true, issue: '' };
  }
};

module.exports = { judgeEdit, PROMPT };
