/**
 * Material and highlights (21 Sep 2026): the two things a product page was
 * missing on launch night. Amazon's "Top highlights" table and "About this
 * item" bullets, Flipkart's "Highlights" - a shopper reads these before the
 * description, and Baymard finds a fifth of them leave when the specs are not
 * there. Cleaned the same way on create and update so the page can trust them.
 */
const MAX_BULLETS = 5;
const MAX_BULLET_LENGTH = 90;
const MAX_MATERIAL_LENGTH = 80;

/** One line: what it is made of - "Brass with kundan stones", "Polyester blend". */
const cleanMaterial = (value) => String(value || '').trim().slice(0, MAX_MATERIAL_LENGTH);

/**
 * Up to five short bullets. Accepts an array or one string with line breaks
 * (the form's textarea); leading bullet marks are stripped so "• Nickel-free"
 * and "Nickel-free" are the same line.
 */
const cleanHighlights = (value) => {
  const lines = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n/) : [];
  return lines
    .map((l) => String(l || '').replace(/^\s*[-*•·]\s*/, '').trim().slice(0, MAX_BULLET_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_BULLETS);
};

module.exports = { cleanMaterial, cleanHighlights, MAX_BULLETS, MAX_BULLET_LENGTH, MAX_MATERIAL_LENGTH };
