/**
 * What the order confirmation email says.
 *
 * A real order - SMP-260906-C23215, ₹2, paid through Razorpay - arrived saying
 * "Payment: PENDING". The database said `paid` and the money had gone. The
 * webhook had claimed the order with an updateOne, which changes the DATABASE
 * and not the copy of the order held in memory, and then built the email from
 * that stale copy.
 *
 * A customer who has just been charged and reads PENDING in capitals concludes
 * their payment failed. Some of them pay again.
 *
 * These tests hold the wording contract, because that is the part a customer
 * actually sees.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { orderConfirmedEmail } = require('../utils/emailTemplates');

const CUSTOMER = { name: 'Abha Mittal' };

const order = (over = {}) => ({
  _id: '6a9c6bba12826b817dc23215',
  orderNumber: 'SMP-260906-C23215',
  totalAmount: 2,
  paymentMethod: 'razorpay',
  paymentStatus: 'paid',
  ...over,
});

describe('the payment line', () => {
  it('says a prepaid order is paid, not pending', async () => {
    const mail = orderConfirmedEmail(order(), CUSTOMER);

    expect(mail.html).toContain('paid online');
    // The exact string that went out on the real order.
    expect(mail.html).not.toContain('PENDING');
  });

  it('tells a COD customer they still owe the money', () => {
    const mail = orderConfirmedEmail(
      order({ paymentMethod: 'cod', paymentStatus: 'pending' }),
      CUSTOMER
    );

    expect(mail.html).toContain('pay cash when it arrives');
  });

  it('does not claim a genuinely unpaid prepaid order is paid', () => {
    const mail = orderConfirmedEmail(
      order({ paymentStatus: 'pending' }),
      CUSTOMER
    );

    expect(mail.html).toContain('awaiting payment');
    expect(mail.html).not.toContain('paid online');
  });

  it('names a refund as a refund', () => {
    const mail = orderConfirmedEmail(
      order({ paymentStatus: 'refunded' }),
      CUSTOMER
    );
    expect(mail.html).toContain('refunded');
  });

  it('always carries the amount', () => {
    for (const status of ['paid', 'pending', 'failed', 'refunded']) {
      const mail = orderConfirmedEmail(order({ paymentStatus: status }), CUSTOMER);
      expect(mail.html).toContain('₹2');
    }
  });
});

describe('what the customer can do with it', () => {
  it('links to the order page on the SITE, not the API', () => {
    process.env.FRONTEND_URL = 'https://www.shopmasterpro.in';
    const mail = orderConfirmedEmail(order(), CUSTOMER);

    expect(mail.html).toContain(
      'https://www.shopmasterpro.in/customer/orders/6a9c6bba12826b817dc23215'
    );
    expect(mail.html).toContain('Track your order');
  });

  it('quotes the order NUMBER, not the database id', () => {
    const mail = orderConfirmedEmail(order(), CUSTOMER);

    // The reference a customer can read out on the phone, and the one the
    // seller's own screen shows. The raw _id is neither.
    expect(mail.subject).toContain('SMP-260906-C23215');
    expect(mail.subject).not.toContain('6a9c6bba');
  });

  it('still has a reference when an old order has no number', () => {
    const mail = orderConfirmedEmail(
      order({ orderNumber: undefined }),
      CUSTOMER
    );
    expect(mail.subject).toContain('#c23215');
  });

  it('has a plain-text part, for clients that refuse HTML', () => {
    const mail = orderConfirmedEmail(order(), CUSTOMER);

    expect(mail.text).toContain('SMP-260906-C23215');
    expect(mail.text).toContain('paid online');
  });
});
