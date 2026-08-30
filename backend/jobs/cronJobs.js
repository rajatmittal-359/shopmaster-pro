const cron = require('node-cron');
const Product = require('../models/Product');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const { lowStockEmail } = require('../utils/emailTemplates');

exports.startCronJobs = () => {
  // Daily at 9 AM - Low stock alert
  cron.schedule('0 9 * * *', async () => {
    console.log('⏰ Running low stock cron...');
    
    try {
      const lowStock = await Product.find({
        isActive: true,
        $expr: { $lte: ['$stock', '$lowStockThreshold'] }
      }).populate('sellerId');

      // Product.sellerId references User, so the populated value IS the seller's
      // user account. The old code read `.userId` off it as though it were a
      // Seller profile; that is always undefined, so the lookup below returned
      // null and every alert was silently skipped. Group by the user directly.
      const bySeller = new Map();

      lowStock.forEach(p => {
        if (!p.sellerId) return; // product whose owner was deleted
        const id = p.sellerId._id.toString();
        if (!bySeller.has(id)) bySeller.set(id, { user: p.sellerId, products: [] });
        bySeller.get(id).products.push(p);
      });

      let sent = 0;
      for (const { user, products } of bySeller.values()) {
        if (!user.email) continue;
        const template = lowStockEmail(products, user);
        await sendEmail({ to: user.email, ...template });
        sent++;
      }

      console.log(`✅ Low stock alerts sent to ${sent} seller(s) for ${lowStock.length} product(s)`);
    } catch (err) {
      console.error('❌ Cron error:', err.message);
    }
  });
  
  console.log('📧 Cron jobs started');
};
