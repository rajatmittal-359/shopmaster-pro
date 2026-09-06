// Order emails
// backend/utils/emailTemplates.js

const { orderUrl } = require('./appUrl');

/**
 * The shell every mail shares: one type size, one width, one voice.
 *
 * The old mails set their own fonts and mostly landed on 13px grey, which on a
 * phone is smaller than everything else in the inbox. Base is 16px here.
 */
const wrap = (inner) => `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;
                max-width:600px;margin:0 auto;padding:8px 4px;
                font-size:16px;line-height:1.6;color:#1f2937">${inner}</div>`;

/** The one button in a mail. Inline styles only - email strips <style>. */
const cta = (href, label) => `
      <p style="margin:0 0 20px 0">
        <a href="${href}"
           style="display:inline-block;padding:13px 22px;background:#2563eb;
                  color:#ffffff;text-decoration:none;border-radius:9px;
                  font-weight:600;font-size:16px">${label}</a>
      </p>`;

/** A labelled fact block, so the reference and the numbers are scannable. */
const facts = (rows) => `
      <div style="background:#f3f4f6;border-radius:10px;padding:16px;margin:0 0 20px 0">
        ${rows
          .filter(([, value]) => value)
          .map(
            ([label, value], i) => `
        <div style="font-size:14px;color:#6b7280;margin:${i ? '12px' : '0'} 0 2px 0">${label}</div>
        <div style="font-size:17px;font-weight:600;color:#111827">${value}</div>`
          )
          .join('')}
      </div>`;

/** The human reference, falling back for orders written before numbers existed. */
const refOf = (order) =>
  order.orderNumber || `#${order._id.toString().slice(-6)}`;


/**
 * How the order was paid for, in words a customer uses.
 *
 * The old mail printed the raw enum in capitals - "Payment: PENDING" - on an
 * order that had been paid. PENDING in shouting capitals reads as "your money
 * did not go through", which is alarming and, on a prepaid order, wrong.
 */
const paymentLine = (order) => {
  const amount = `₹${order.totalAmount}`;

  if (order.paymentStatus === 'paid') {
    return order.paymentMethod === 'cod'
      ? `${amount} — cash collected on delivery`
      : `${amount} — paid online`;
  }
  if (order.paymentStatus === 'refunded') return `${amount} — refunded`;
  if (order.paymentStatus === 'failed') return `${amount} — payment failed`;

  return order.paymentMethod === 'cod'
    ? `${amount} — pay cash when it arrives`
    : `${amount} — awaiting payment`;
};

/**
 * Order confirmation.
 *
 * WHAT CHANGED AND WHY
 *   The body was 13px grey on a phone, which is smaller than anything else in
 *   an inbox. Base text is 16px now, small print 14px, and the line height is
 *   loose enough to read at arm's length.
 *
 *   It led with the Mongo _id - "6a9c6bba12826b817dc23215" - which nobody can
 *   read out on a phone call. The order NUMBER is the reference the seller
 *   screen shows and the customer would actually quote.
 *
 *   And it had no link. "We'll email you tracking" left the customer waiting
 *   for a message instead of giving them the page that already exists and
 *   shows where the parcel is.
 */
exports.orderConfirmedEmail = (order, customer) => {
  const ref = order.orderNumber || `#${order._id.toString().slice(-6)}`;
  const link = orderUrl(order._id);

  return {
    subject: `Order confirmed · ${ref} · ShopMaster Pro`,
    text:
      `Hi ${customer.name},

` +
      `Your order ${ref} is confirmed.
` +
      `Payment: ${paymentLine(order)}

` +
      `Track it here: ${link}

` +
      `Shipped in 1-3 working days, delivered in about 3-7 after that.
`,
    html: `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;
                max-width:600px;margin:0 auto;padding:8px 4px;
                font-size:16px;line-height:1.6;color:#1f2937">

      <h2 style="font-size:22px;margin:0 0 16px 0;color:#111827">
        Your order is confirmed
      </h2>

      <p style="margin:0 0 16px 0">Hi ${customer.name},</p>

      <div style="background:#f3f4f6;border-radius:10px;padding:16px;margin:0 0 20px 0">
        <div style="font-size:14px;color:#6b7280;margin-bottom:2px">Order</div>
        <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:12px">
          ${ref}
        </div>
        <div style="font-size:14px;color:#6b7280;margin-bottom:2px">Payment</div>
        <div style="font-size:17px;font-weight:600;color:#111827">
          ${paymentLine(order)}
        </div>
      </div>

      <!-- The tracking the customer already has, rather than a promise of an
           email later. This page shows every stage the parcel reaches. -->
      <p style="margin:0 0 20px 0">
        <a href="${link}"
           style="display:inline-block;padding:13px 22px;background:#2563eb;
                  color:#ffffff;text-decoration:none;border-radius:9px;
                  font-weight:600;font-size:16px">Track your order</a>
      </p>

      <p style="margin:0 0 20px 0;font-size:15px;color:#374151">
        You will also get an email with the courier and tracking number the
        moment the seller hands your parcel over.
      </p>

      <div style="border-top:1px solid #e5e7eb;padding-top:16px;
                  font-size:14px;line-height:1.6;color:#4b5563">
        <p style="margin:0 0 8px 0;font-weight:600;color:#374151">
          What happens next
        </p>
        <ul style="padding-left:20px;margin:0 0 16px 0">
          <li style="margin-bottom:5px">Shipped within 1&ndash;3 working days.</li>
          <li style="margin-bottom:5px">Delivery usually 3&ndash;7 days after that, depending on your pincode.</li>
          <li>Cancel any time before it ships, from the link above.</li>
        </ul>

        <p style="margin:0 0 8px 0;font-weight:600;color:#374151">
          Returns and refunds
        </p>
        <p style="margin:0 0 16px 0">
          Once delivered, returns follow the seller&rsquo;s policy. Any refund on a
          prepaid order goes back to the way you paid.
        </p>
      </div>

      <p style="margin:0;font-size:15px;color:#6b7280">
        Thanks for shopping with <strong style="color:#374151">ShopMaster Pro</strong>.
      </p>
    </div>
  `,
  };
};

exports.orderStatusEmail = (order, customer, status) => {
  const ref = refOf(order);
  const link = orderUrl(order._id);

  // What each step actually means for the person waiting, rather than the enum.
  const meaning = {
    processing: 'The seller is packing it now.',
    shipped: 'It has left the seller and is with the courier.',
    delivered: 'It has been delivered. Anything wrong? Open the order and tell us.',
    cancelled: 'This order has been cancelled. Any payment made goes back the way it came.',
    returned: 'The return is complete.',
  }[status];

  return {
    subject: `${ref} is now ${status} · ShopMaster Pro`,
    text: `Hi ${customer.name},

Order ${ref} is now ${status}.
${meaning || ''}

${link}
`,
    html: wrap(`
      <h2 style="font-size:22px;margin:0 0 16px 0;color:#111827">
        Your order is ${status}
      </h2>

      <p style="margin:0 0 16px 0">Hi ${customer.name},</p>

      ${facts([['Order', ref], ['Status', status]])}

      ${meaning ? `<p style="margin:0 0 20px 0">${meaning}</p>` : ''}

      ${cta(link, 'Open your order')}

      <p style="margin:0;font-size:15px;color:#6b7280">
        Thanks for shopping with <strong style="color:#374151">ShopMaster Pro</strong>.
      </p>
    `),
  };
};

/**
 * The password reset mail.
 *
 * It says WHEN the link dies and what to do if the person did not ask for it,
 * because a reset mail arriving unprompted is how someone finds out their
 * address is being targeted. Saying "ignore this" is the whole safety advice,
 * and it only works if it is in the mail.
 */
exports.passwordResetEmail = (user, link) => ({
  subject: 'Reset your ShopMaster Pro password',
  html: `
    <h3>Hi ${user.name || 'there'},</h3>
    <p>Someone asked to reset the password for this account.</p>
    <p>
      <a href="${link}"
         style="display:inline-block;padding:10px 18px;background:#2563eb;
                color:#ffffff;text-decoration:none;border-radius:8px;
                font-weight:600">Choose a new password</a>
    </p>
    <p>Or paste this into your browser:<br>
      <span style="word-break:break-all">${link}</span>
    </p>
    <p><b>This link works for one hour, and once only.</b></p>
    <p style="color:#555">
      If you did not ask for this, you can ignore this email - your password
      has not changed.
    </p>
  `,
  text:
    `Hi ${user.name || 'there'},

` +
    `Someone asked to reset the password for this account.

` +
    `${link}

` +
    `This link works for one hour, and once only.

` +
    `If you did not ask for this, ignore this email - your password has not changed.
`,
});

// Seller emails
exports.lowStockEmail = (products, seller) => {
  const list = products.map(p => `<li>${p.name} - Stock: ${p.stock}</li>`).join('');
  return {
    subject: '⚠️ Low Stock Alert',
    html: `<h3>Hi ${seller.name},</h3><p>Low stock products:</p><ul>${list}</ul>`
  };
};

exports.newOrderEmail = (order, seller) => ({
  subject: 'New Order Received',
  html: `<h3>Hi ${seller.name},</h3><p>You have a new order worth ₹${order.totalAmount}</p>`
});

// backend/utils/emailTemplates.js

exports.shippingNotificationEmail = (order, customer, trackingInfo) => {
  const ref = refOf(order);
  const link = orderUrl(order._id);

  return {
    subject: `On its way · ${ref} · ShopMaster Pro`,
    text:
      `Hi ${customer.name},

` +
      `Order ${ref} has been shipped.
` +
      `Courier: ${trackingInfo.courierName}
` +
      `Tracking number: ${trackingInfo.trackingNumber}

` +
      `Follow it here: ${link}
`,
    html: wrap(`
      <h2 style="font-size:22px;margin:0 0 16px 0;color:#111827">
        Your order is on its way
      </h2>

      <p style="margin:0 0 16px 0">Hi ${customer.name},</p>

      ${facts([
        ['Order', ref],
        ['Courier', trackingInfo.courierName],
        ['Tracking number', trackingInfo.trackingNumber],
        [
          'Shipped',
          trackingInfo.shippedDate
            ? new Date(trackingInfo.shippedDate).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : null,
        ],
      ])}

      <!--
        This used to send the customer to the courier's own site and ask them to
        COPY THE TRACKING NUMBER IN BY HAND - and only when the courier happened
        to be called "shiprocket"; for every other courier there was no link at
        all. The order page shows the courier, the number and the progress
        already, so that is where they go: our own tracking, one tap, always
        there whoever is carrying the parcel.
      -->
      ${cta(link, 'See where it is')}

      <p style="margin:0 0 20px 0;font-size:15px;color:#374151">
        Usually 3&ndash;7 days from here, depending on your pincode.
      </p>

      <p style="margin:0;font-size:15px;color:#6b7280">
        Thanks for shopping with <strong style="color:#374151">ShopMaster Pro</strong>.
      </p>
    `),
  };
};
