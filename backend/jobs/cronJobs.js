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

      const sellerMap = {};
      
      lowStock.forEach(p => {
        const sid = p.sellerId._id.toString();
        if (!sellerMap[sid]) sellerMap[sid] = { seller: p.sellerId, products: [] };
        sellerMap[sid].products.push(p);
      });

      for (const data of Object.values(sellerMap)) {
        const user = await User.findById(data.seller.userId);
        const template = lowStockEmail(data.products, user);
        await sendEmail({ to: user.email, ...template });
      }
      
      console.log('✅ Low stock emails sent');
    } catch (err) {
      console.error('❌ Cron error:', err.message);
    }
  });
  
  console.log('📧 Cron jobs started');
};
