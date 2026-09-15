// Through the module object so tests can stand in for the model.
const gemini = require('./gemini');

/**
 * What does the shop-board photo say? (plan 2.40)
 *
 * The one place a model earns its keep in seller verification at our size:
 * Amazon's video KYC asks to see the board; ours asks for a photo of it and
 * has the model read the name off it, so the admin's list can say "board
 * reads 'Charming Jewels'" or "no shop board in this photo" without anyone
 * zooming into a JPEG. One call per application, the cheap model, and a
 * failure is a dash in the list - never a block. The admin still decides.
 *
 * @returns {Promise<{ok:boolean, text?:string, isShop?:boolean|null, matches?:boolean|null, reason?:string}>}
 */
const readBoard = async (photoUrl, businessName) => {
  if (!photoUrl) return { ok: false, reason: 'no photo' };
  const r = await gemini.generate(
    'You are checking a seller application for a small marketplace. Look at the photo. Answer in JSON only: {"text": the largest shop name or signboard text you can read, or "" if none, "isShop": true if this is a real shop front, board, counter or workshop, false if it is a stock photo, screenshot, a person only, or unrelated, "notes": one short sentence}. Do not guess a name that is not visibly written.',
    { imageUrl: photoUrl, responseSchema: { type: 'OBJECT', properties: { text: { type: 'STRING' }, isShop: { type: 'BOOLEAN' }, notes: { type: 'STRING' } }, required: ['text', 'isShop'] }, temperature: 0, attempts: 1, model: gemini.LITE_MODEL }
  );
  if (!r.ok) return { ok: false, reason: r.reason || 'model unavailable' };
  let parsed;
  try {
    const mtch = String(r.text).match(/\{[\s\S]*\}/);
    parsed = JSON.parse(mtch ? mtch[0] : r.text);
  } catch {
    return { ok: false, reason: 'unreadable answer' };
  }
  const text = String(parsed.text || '').trim().slice(0, 80);
  const { namesAgree } = require('./kyc');
  const matches = text && businessName ? namesAgree(text, businessName) : null;
  return { ok: true, text, isShop: typeof parsed.isShop === 'boolean' ? parsed.isShop : null, matches, notes: String(parsed.notes || '').slice(0, 160) };
};

module.exports = { readBoard };
