// backend/quickFixDisplayOrder.js
const mongoose = require('mongoose');
const Category = require('./models/Category');
require('dotenv').config();

async function quickFix() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // EXACT ORDER FROM YOUR SCREENSHOT:
    const updates = [
      { name: 'Earrings', order: 1 },
      { name: 'Necklace & Pendent Sets', order: 2 },
      { name: 'Bangles & Bracelets', order: 3 },
      { name: 'Rings', order: 4 },
      { name: 'Anklets & Bichhiya', order: 5 },
      { name: 'Maang Tikka & Matha Patti', order: 6 },
      { name: 'Nose Pins & Nath', order: 7 },
      { name: 'Hair Accessories', order: 8 },
      { name: 'Kamarbandh & Saree Pins', order: 9 },
      { name: 'Mangalsutra and Chain', order: 10 },
    ];

    for (const item of updates) {
      const res = await Category.updateOne(
        { name: item.name },
        { $set: { displayOrder: item.order } }
      );
      console.log(`➡ ${item.order}. ${item.name} (modified: ${res.modifiedCount})`);
    }

    console.log('\n✅ Done!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  }
}

quickFix();
