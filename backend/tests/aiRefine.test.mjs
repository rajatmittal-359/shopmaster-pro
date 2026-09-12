/**
 * Per-field help on a listing the seller wrote themselves.
 *
 * Shopify Magic's sparkle sits beside the title and the description, not on
 * a separate "AI" button: improve what is there, translate it, shorten it.
 * Rajat, 12 Sep 2026: a seller may write in Hindi or Hinglish, or write
 * English badly, and must be able to fix ONE field without regenerating the
 * whole listing. The same honesty rules as the draft apply - no invented
 * facts, no purity claims, only the allowed HTML.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { refineField, ACTIONS } = require('../utils/ai/refine');

const withModel = (text) => ({ generate: async () => ({ ok: true, text, provider: 'gemini' }) });

describe('refineField', () => {
  it('knows the four actions and refuses anything else', async () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(['detail', 'polish', 'shorten', 'translate']);
    const out = await refineField({ field: 'name', action: 'shout', text: 'x' }, withModel('X'));
    expect(out.ok).toBe(false);
  });

  it('refuses an empty field - there is nothing to refine', async () => {
    const out = await refineField({ field: 'name', action: 'polish', text: '   ' }, withModel('X'));
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/write something first/i);
  });

  it('returns a clean title, capped, one line', async () => {
    const out = await refineField({ field: 'name', action: 'translate', text: 'सोने जैसी झुमकी' }, withModel('"Gold-toned Jhumka Earrings"\n'));
    expect(out.ok).toBe(true);
    expect(out.text).toBe('Gold-toned Jhumka Earrings');
  });

  it('keeps only the allowed HTML in a description and flags a purity claim', async () => {
    const out = await refineField(
      { field: 'description', action: 'polish', text: '<p>ok</p>' },
      withModel('<h1>Pure 22k gold</h1><p>Wear it <script>x</script>daily.</p>')
    );
    expect(out.ok).toBe(true);
    expect(out.text).not.toMatch(/<h1>|<script>/);
    expect(out.warnings.join(' ')).toMatch(/purity|gold/i);
  });

  it('passes the model an instruction that names the action and the language rule', async () => {
    let prompt;
    await refineField(
      { field: 'description', action: 'translate', text: 'achhi quality ka kurta' },
      { generate: async (p) => { prompt = p; return { ok: true, text: '<p>Good quality kurta</p>' }; } }
    );
    expect(prompt).toMatch(/English/);
    expect(prompt).toMatch(/Hindi|Hinglish|any language/i);
    expect(prompt).toMatch(/invent nothing|do not add/i);
  });
});
