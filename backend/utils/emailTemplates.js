// Order emails
// backend/utils/emailTemplates.js

exports.orderConfirmedEmail = (order, customer) => ({
  subject: `Order Confirmed #${order._id.toString().slice(-6)} - ShopMaster Pro`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Order Confirmation</h2>
      <p>Hi ${customer.name},</p>
      <p>Your order has been confirmed!</p>

      <div style="background: #f5f5f5; padding: 15px; margin: 20px 0;">
        <strong>Order ID:</strong> ${order._id}<br>
        <strong>Total:</strong> ₹${order.totalAmount}<br>
        <strong>Payment:</strong> ${order.paymentStatus === 'completed' ? 'Paid' : 'COD'}
      </div>

      <p>We'll send tracking details once shipped.</p>
      <p>Thanks for shopping!</p>
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
        <strong>Shipped Date:</strong> ${new Date(trackingInfo.shippedDate).toLocaleDateString()}
      </div>
      
      <p>Track your order using the tracking number above.</p>
      <p>Expected delivery: 3-5 business days</p>
    </div>
  `,
});
