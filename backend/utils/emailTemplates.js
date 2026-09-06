// Order emails
// backend/utils/emailTemplates.js

// Order confirmation email
exports.orderConfirmedEmail = (order, customer) => ({
  subject: `Order Confirmed #${order._id.toString().slice(-6)} - ShopMaster Pro`,
  text: `Hi ${customer.name}, your order has been confirmed. Order total: ₹${order.totalAmount}. Payment: ${order.paymentStatus}.`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>✅ Order Confirmation</h2>
      <p>Hi ${customer.name},</p>
      <p>Your order has been confirmed!</p>

      <div style="background: #f5f5f5; padding: 15px; margin: 20px 0;">
        <strong>Order ID:</strong> ${order._id}<br>
        <strong>Total:</strong> ₹${order.totalAmount}<br>
        <strong>Payment:</strong> ${order.paymentStatus.toUpperCase()}
      </div>

      <p style="margin: 0 0 8px 0;">
        We'll send your tracking details by email as soon as the seller ships your order.
      </p>

      <p style="font-size: 13px; color: #555; margin: 12px 0 4px 0;">
        <strong>Key information:</strong>
      </p>
      <ul style="font-size: 13px; color: #555; padding-left: 18px; margin: 0 0 10px 0;">
        <li>Orders are usually shipped within 1–3 business days after confirmation.</li>
        <li>Delivery time depends on your pincode and courier partner (typically 3–7 business days after dispatch).</li>
        <li>Cash on Delivery (COD), if selected, is paid directly to the delivery partner at the time of delivery.</li>
      </ul>

      <p style="font-size: 13px; color: #555; margin: 0 0 10px 0;">
        <strong>Returns & refunds:</strong><br/>
        Eligible orders can be cancelled before they are shipped from the “My Orders” section in your account.
        For delivered orders, returns are processed as per the seller’s return policy and any eligible refund
        (for prepaid orders) will be issued back to the original payment method.
      </p>

      <p style="margin-top: 16px;">
        Thanks for shopping with <strong>ShopMaster Pro</strong>!
      </p>
    </div>
  `,
});


exports.orderStatusEmail = (order, customer, status) => ({
  subject: `Order ${status} - ShopMaster Pro`,
  html: `
    <h3>Hi ${customer.name},</h3>
    <p>Your order #${order._id} is now <b>${status}</b>.</p>
  `
});

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

exports.shippingNotificationEmail = (order, customer, trackingInfo) => ({
  subject: `Order Shipped #${order._id.toString().slice(-6)} - ShopMaster Pro`,
  text: `Hi ${customer.name}, your order has been shipped! Tracking: ${trackingInfo.trackingNumber}`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>🚚 Your Order is on the Way!</h2>
      <p>Hi ${customer.name},</p>
      <p>Great news! Your order has been shipped.</p>
      
      <div style="background: #f5f5f5; padding: 15px; margin: 20px 0;">
        <strong>Order ID:</strong> ${order._id}<br>
        <strong>Courier:</strong> ${trackingInfo.courierName}<br>
        <strong>Tracking Number:</strong> ${trackingInfo.trackingNumber}<br>
        <strong>Shipped Date:</strong> ${new Date(
          trackingInfo.shippedDate
        ).toLocaleDateString()}
      </div>

      <p style="margin: 0 0 8px 0;">
        Track your order using the tracking number above.
      </p>

      <p style="font-size: 13px; color: #555; margin: 0 0 12px 0;">
        <strong>How to track your order:</strong><br/>
        1) Click the “Track on Shiprocket” button below.<br/>
        2) If asked, paste this tracking number: 
        <strong>${trackingInfo.trackingNumber}</strong>.<br/>
        3) You will see the current status and expected delivery date.
      </p>

      <p style="margin: 0 0 16px 0;">
        Expected delivery: 3-5 business days.
      </p>

      ${
        trackingInfo.courierName &&
        trackingInfo.courierName.toLowerCase() === "shiprocket"
          ? `
        <p style="margin: 0;">
          <a
            href="https://www.shiprocket.in/shipment-tracking/"
            target="_blank"
            style="
              display: inline-block;
              padding: 10px 16px;
              background-color: #2563eb;
              color: #ffffff;
              text-decoration: none;
              border-radius: 4px;
              font-size: 13px;
            "
          >
            Track on Shiprocket
          </a>
        </p>
      `
          : ""
      }
    </div>
  `,
});
