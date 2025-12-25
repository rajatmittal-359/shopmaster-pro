// backend/reorderJewelleryOnly.js
const mongoose = require('mongoose');
const Category = require('./models/Category');
require('dotenv').config();

const JEWELLERY_ORDER = [
  'Necklace & Pendent Sets',
  'Earrings',
  'Bangles & Bracelets',
  'Mangalsutra and Chain',
  'Rings',
  'Nose Pins & Nath',
  'Maang Tikka & Matha Patti',
  'Hair Accessories',
  'Kamarbandh & Saree Pins',
  'Anklets & Bichhiya',
];

async function reorderJewellery() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find Jewellery parent
    const parent = await Category.findOne({ 
      name: 'Jewellery & Accessories',
      parentCategory: null 
    });

    if (!parent) {
      console.log('❌ Jewellery & Accessories not found');
      process.exit(1);
    }

    console.log(`✅ Found: ${parent.name}`);

    // Get all subcategories
    const subs = await Category.find({ parentCategory: parent._id });
    console.log(`✅ Found ${subs.length} subcategories\n`);

    // Update displayOrder
    for (let i = 0; i < JEWELLERY_ORDER.length; i++) {
      const catName = JEWELLERY_ORDER[i];
      const cat = subs.find(c => c.name === catName);
      
      if (cat) {
        cat.displayOrder = i + 1;
        await cat.save();
        console.log(`✅ ${i + 1}. ${catName}`);
      } else {
        console.log(`⚠️  ${catName} NOT FOUND`);
      }
    }

    console.log('\n✅ Reordering complete!');
    await mongoose.disconnect();
    process.exit(0);

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

reorderJewellery();
