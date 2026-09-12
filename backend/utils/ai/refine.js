const gemini = require('../gemini');
const { PURITY_CLAIMS } = require('../productCopy');
const { checkDescriptionHtml } = require('../safeHtml');

/**
 * Help on ONE field the seller already wrote.
 *
 * THE SHAPE, FROM THE REFERENCES (12 Sep 2026)
 *   Shopify Magic puts a sparkle beside the title and beside the description:
 *   improve, change tone, translate. Amazon's listing assistant does the same
 *   per attribute. The whole-listing draft (listing.js) is a different job -
 *   starting from nothing. This is for a seller who wrote something, in
 *   whatever language, and wants it better without losing it.
 *
 * THE SAME HONESTY AS THE DRAFT
 *   The model may reword, translate, tidy and shorten. It may not add facts,
 *   and it may not add purity claims to jewellery - both are checked here,
 *   not merely asked for. Output is a single line for the title and the
 *   allowed HTML for the description; anything else is stripped.
 */
const ACTIONS = {
  polish: 'Fix the spelling, grammar and flow. Keep every fact and the same length. Same language as the input, unless it is not English - then English.',
  translate: 'Translate into plain, natural English an Indian shopper would search for. Keep every fact. Nothing else changes.',
  shorten: 'Make it about half as long. Keep the facts that matter most to a buyer; cut repetition and filler.',
  detail: 'Say a little more - when and with what it would be worn or used, how to care for it - but ONLY what follows from the text itself. Do not add specifications.',
};

const FIELD = {
  name: { label: 'product title', max: 120, format: 'ONE line of plain text, 40-90 characters, no quotes, no trailing full stop. No brand, no price.' },
  description: {
    label: 'product description',
    max: 4000,
    format: 'HTML using only <p>, <ul>, <li>, <strong>, <em>. Two or three short paragraphs at most. No headings, no links, no styles, no markdown.',
  },
};

const refineField = async ({ field, action, text, context = {} }, deps = {}) => {
  const generate = deps.generate || gemini.generate;
  const spec = FIELD[field];
  const instruction = ACTIONS[action];
  if (!spec || !instruction) return { ok: false, reason: 'That is not something the AI can do here.' };

  const input = String(text || '').trim();
  if (!input) return { ok: false, reason: 'Write something first - even a line in Hindi or Hinglish is enough.' };

  const facts = [
    context.name ? `Product title: ${context.name}` : null,
    context.categoryName ? `Category: ${context.categoryName}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `You are helping a small Indian seller on a marketplace based in Jaipur improve the ${spec.label} of a listing.

The seller's text may be in English, Hindi, Hinglish or any language. Your answer is ALWAYS in English.

Task: ${instruction}

RULES:
- Invent nothing. Do not add materials, counts, sizes, guarantees or claims that are not in the seller's text.
- If it is jewellery, it is imitation jewellery: never "gold", "silver", "hallmarked", "925", "22k", "genuine" or "natural" stones - use "gold-toned", "silver-toned", "stone-studded".
- No shop name, brand, price or delivery talk.
- Format: ${spec.format}
- Answer with the ${spec.label} only. No preamble, no explanation.

${facts ? `Known about the product:\n${facts}\n\n` : ''}Seller's ${spec.label}:
${input.slice(0, spec.max)}`;

  const answer = await generate(prompt, { temperature: 0.4, textModel: context.textModel || 'auto' });
  if (!answer.ok) return answer;

  const warnings = [];
  let out = String(answer.text || '').trim();

  if (field === 'name') {
    out = out.replace(/^["'“”]+|["'“”]+$/g, '').replace(/\s+/g, ' ').replace(/\.\s*$/, '').trim().slice(0, spec.max);
  } else {
    out = out.replace(/^```(?:html)?\s*|\s*```$/g, '').trim();
    const html = checkDescriptionHtml(out);
    if (!html.ok) {
      // Keep the words, drop the markup we do not allow - the seller can still edit a paragraph.
      out = out
        .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
        .replace(/<(?!\/?(p|ul|ol|li|strong|em|br)\b)[^>]*>/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!/^<p>/i.test(out)) out = `<p>${out}</p>`;
      warnings.push('Some formatting was removed - only paragraphs, bullets, bold and italic are allowed.');
    }
    out = out.slice(0, spec.max);
  }

  if (PURITY_CLAIMS.test(out)) {
    warnings.push('It mentions gold, silver or a purity mark - check that, imitation jewellery must not claim it.');
  }
  if (!out) return { ok: false, reason: 'The model returned nothing. Try again.' };

  return { ok: true, text: out, warnings, provider: answer.provider || 'gemini', model: answer.model };
};

module.exports = { refineField, ACTIONS };
