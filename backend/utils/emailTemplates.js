// Order emails
exports.orderConfirmedEmail = (order, customer) => ({
  subject: 'Order Confirmed - ShopMaster Pro',
  html: `
    <h3>Hi ${customer.name},</h3>
    <p>Your order has been confirmed!</p>
    <p><b>Order ID:</b> ${order._id}</p>
    <p><b>Total:</b> ₹${order.totalAmount}</p>
  `
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
