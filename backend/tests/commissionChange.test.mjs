/**
 * Telling a seller their cut has changed.
 *
 * WHY THE EMAIL IS PART OF THE FEATURE, NOT A NICETY
 *   A commission rate decides what a seller takes home on every sale they make
 *   from now on. Changing it silently means they find out from a payout that is
 *   smaller than they expected - which is the same unfairness the rest of this
 *   codebase spends its time removing: the party with the power tells the other
 *   party afterwards, or not at all.
 *
 * The rules being defended:
 *   1. both numbers are in it - "now 12%" alone tells a seller nothing
 *   2. it says past orders are unaffected, because that is a seller's first fear
 *   3. it never claims a commission was taken from delivery, because it is not
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { commissionChangedEmail } = require('../utils/emailTemplates');

describe('the mail a seller gets', () => {
  it('carries the old rate AND the new one', () => {
    const { html, text } = commissionChangedEmail(
      { name: 'Vikram Rao' },
      { from: 8, to: 12 }
    );

    // "Your commission is now 12%" alone is not something anybody can act on.
    expect(html).toContain('8%');
    expect(html).toContain('12%');
    expect(text).toContain('8%');
    expect(text).toContain('12%');
  });

  it('says plainly when there is no commission any more', () => {
    const { subject, text } = commissionChangedEmail(
      { name: 'Rahul Jingar' },
      { from: 8, to: 0 }
    );

    expect(subject).toMatch(/commission-free/i);
    expect(text).toMatch(/keep the whole item value/i);
  });

  it('does not call a rate rise good news', () => {
    const { html } = commissionChangedEmail({ name: 'Vikram' }, { from: 8, to: 15 });

    expect(html).not.toMatch(/you keep more/i);
    expect(html).toMatch(/applies to sales you make from now on/i);
  });

  it('does call a rate cut good news', () => {
    const { html } = commissionChangedEmail({ name: 'Vikram' }, { from: 15, to: 8 });

    expect(html).toMatch(/you keep more/i);
  });

  /**
   * The first thing a seller wonders when a rate changes is whether the money
   * they are already owed just moved. It did not - rates are snapshotted onto
   * each order line - and saying so is the difference between a fair notice and
   * an alarming one.
   */
  it('answers the question a seller will actually have', () => {
    const { html, text } = commissionChangedEmail({ name: 'Vikram' }, { from: 8, to: 12 });

    // The HTML emphasises "already received", so match around the markup
    // rather than through it.
    expect(html).toMatch(/keep the rate they were\s+sold under/i);
    expect(html).toMatch(/nothing you are already owed changes/i);
    expect(text).toMatch(/already received keep the rate they were sold under/i);
  });

  it('is honest that delivery is never commissioned', () => {
    const { html } = commissionChangedEmail({ name: 'Vikram' }, { from: 8, to: 12 });
    expect(html).toMatch(/item value only, never from delivery/i);
  });

  it('addresses somebody even with no name on the profile', () => {
    const { text } = commissionChangedEmail({}, { from: 8, to: 0 });
    expect(text).toMatch(/^Hi there,/);
  });

  it('falls back to the business name when there is no personal one', () => {
    const { text } = commissionChangedEmail(
      { businessName: 'Rao Traders' },
      { from: 8, to: 0 }
    );
    expect(text).toMatch(/Hi Rao Traders,/);
  });
});
