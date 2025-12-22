// backend/migrateProductWeights.js
const mongoose = require('mongoose');
const Product = require('./models/Product');
require('dotenv').config();

async function migrateWeights() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');

    // Find all products WITHOUT weight field
    const productsWithoutWeight = await Product.find({
      $or: [
        { weight: { $exists: false } },
        { weight: null }
      ]
    });

    console.log(`\n📦 Found ${productsWithoutWeight.length} products without weight\n`);

    if (productsWithoutWeight.length === 0) {
      console.log('✅ All products already have weight field. No migration needed.\n');
      process.exit(0);
    }

    // Update each product with default weight
    let updated = 0;
    for (const product of productsWithoutWeight) {
      // Assign smart default based on category (optional logic)
      let defaultWeight = 0.5; // Default for most items

      // Smart defaults (optional - you can customize)
      if (product.category) {
        const categoryName = product.category.toString();
        // Footwear typically heavier
        if (categoryName.includes('Footwear')) defaultWeight = 0.8;
        // Jewelry lighter
        if (categoryName.includes('Jewelry')) defaultWeight = 0.2;
        // Bags heavier
        if (categoryName.includes('Bags')) defaultWeight = 1.0;
      }

      product.weight = defaultWeight;
      await product.save();
      
      console.log(`✅ Updated: ${product.name} → ${defaultWeight} kg`);
      updated++;
    }

    console.log(`\n🎉 Migration Complete!`);
    console.log(`   Total products updated: ${updated}`);
    console.log(`   Default weight assigned: 0.5 kg (smart defaults applied where applicable)\n`);

    await mongoose.disconnect();
    console.log('✅ Database disconnected\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

migrateWeights();
