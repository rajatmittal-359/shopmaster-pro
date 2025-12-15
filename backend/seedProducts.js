// backend/seedProducts.js
const mongoose = require('mongoose');
const Product = require('./models/Product');
const User = require('./models/User');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI;

// ✅ ACTUAL CATEGORY IDs FROM DATABASE
const categories = {
  // Fashion & Apparel Subcategories
  menClothing: "693d4e6b91fb4c305d7a418d",
  womenClothing: "693d4e6b91fb4c305d7a418f",
  kidsWear: "693d4e6b91fb4c305d7a4191",
  clothingAccessories: "693d4e6b91fb4c305d7a4193",

  // Footwear Subcategories
  menFootwear: "693d4e6b91fb4c305d7a4197",
  womenFootwear: "693d4e6b91fb4c305d7a4199",
  kidsFootwear: "693d4e6b91fb4c305d7a419b",

  // Jewelry & Accessories Subcategories
  artificialJewelry: "693d4e6c91fb4c305d7a419f",
  silverJewelry: "693d4e6c91fb4c305d7a41a1",
  lifestyleAccessories: "693d4e6c91fb4c305d7a41a3",

  // Bags & Luggage Subcategories
  backpacks: "693d4e6c91fb4c305d7a41a7",
  handbagsWallets: "693d4e6c91fb4c305d7a41a9",
  travelLuggage: "693d4e6c91fb4c305d7a41ab",

  // Watches & Wearables Subcategories
  menWatches: "693d4e6c91fb4c305d7a41af",
  womenWatches: "693d4e6c91fb4c305d7a41b1",
  smartWearables: "693d4e6d91fb4c305d7a41b3",

  // Electronics & Accessories Subcategories
  mobileAccessories: "693d4e6d91fb4c305d7a41b7",
  audioDevices: "693d4e6d91fb4c305d7a41b9",
  techGadgets: "693d4e6d91fb4c305d7a41bb",

  // Beauty & Personal Care Subcategories
  skincare: "693d4e6d91fb4c305d7a41bf",
  cosmeticsMakeup: "693d4e6d91fb4c305d7a41c1",
  fragrances: "693d4e6d91fb4c305d7a41c3",
  menGrooming: "693d4e6d91fb4c305d7a41c5",
};

// Helper – adds default fields matching Product model
function product(p) {
  return {
    ...p,
    stock: 50,  // ✅ ADD STOCK
    isActive: true,
    lowStockThreshold: 10,
    avgRating: 0,
    totalReviews: 0
  };
}

// Realistic image sets (Unsplash)
const img = {
  tshirt: [
    "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1521572162944-9ffdc0e3f77b?auto=format&fit=crop&w=600&q=80",
  ],
  jeans: [
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1514996937319-344454492b37?auto=format&fit=crop&w=600&q=80",
  ],
  dress: [
    "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1495121553079-4c61bcce189c?auto=format&fit=crop&w=600&q=80",
  ],
  shoes: [
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1539185441755-769473a23570?auto=format&fit=crop&w=600&q=80",
  ],
  sneakers: [
    "https://images.unsplash.com/photo-1519744792095-2f2205e87b6f?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80",
  ],
  necklace: [
    "https://images.unsplash.com/photo-1582060114903-429563460656?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80",
  ],
  earrings: [
    "https://images.unsplash.com/photo-1617038260897-41a9a2c94a08?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=600&q=80",
  ],
  backpack: [
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1516478177764-9fe5bdc5aff3?auto=format&fit=crop&w=600&q=80",
  ],
  wallet: [
    "https://images.unsplash.com/photo-1511391037251-0c6fcef2e63b?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1612810432633-96f64dc8ccb6?auto=format&fit=crop&w=600&q=80",
  ],
  watch: [
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1508682642025-0c0be9c779b1?auto=format&fit=crop&w=600&q=80",
  ],
  smartwatch: [
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80",
  ],
  earbuds: [
    "https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=600&q=80",
  ],
  headphones: [
    "https://images.unsplash.com/photo-1512663150964-d8f925fe2c88?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1516908205727-40afad9449a0?auto=format&fit=crop&w=600&q=80",
  ],
  powerbank: [
    "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=600&q=80",
  ],
  perfume: [
    "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=600&q=80",
  ],
  facewash: [
    "https://images.unsplash.com/photo-1612810432633-96f64dc8ccb6?auto=format&fit=crop&w=600&q=80",
  ],
  lotion: [
    "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=600&q=80",
  ],
};

async function seedProducts() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected');

    // ✅ Get actual seller ID from database
    const seller = await User.findOne({ role: 'seller' });
    if (!seller) {
      console.error('❌ No seller found. Create seller account first.');
      process.exit(1);
    }

    console.log(`✅ Found seller: ${seller.email} (${seller._id})`);
    const sellerId = seller._id;

    const products = [
      product({
  sellerId,
  name: "Traditional Gold Plated Bridal Necklace Set",
  description: `
Handcrafted traditional necklace set designed for weddings and festive occasions.

Made with brass alloy and premium gold plating for a rich finish.
Includes matching earrings for a complete bridal look.

Care: Store in a dry place. Avoid direct contact with water or perfume.
Ships within 2–3 business days. 7-day replacement available.
`,
  category: categories.artificialJewelry,
  price: 4590,
  mrp: 5990,
  brand: "Charmora",
  sku: "CH-JWL-001",
  tags: ["necklace", "bridal", "gold plated", "jewellery"],
  images: ["CLOUDINARY_URL_HERE"]
}),
product({
  sellerId,
  name: "Oxidized Silver Jhumka Earrings",
  description: `
Traditional oxidized jhumka earrings with detailed handcrafted design.

Lightweight and suitable for daily ethnic wear and festive styling.
Comfortable for long hours of use.

Care: Clean with a soft dry cloth after use.
Ships within 2–3 business days.
`,
  category: categories.artificialJewelry,
  price: 1290,
  mrp: 1790,
  brand: "Charmora",
  sku: "CH-JWL-002",
  tags: ["earrings", "jhumka", "oxidized", "ethnic"],
  images: ["CLOUDINARY_URL_HERE"]
}),
product({
  sellerId,
  name: "925 Sterling Silver Adjustable Ring",
  description: `
Elegant sterling silver ring crafted for everyday wear.

Made from 925 purity silver with adjustable sizing.
Minimal design suitable for office and casual outfits.

Care: Avoid moisture. Store in a jewelry box when not in use.
`,
  category: categories.silverJewelry,
  price: 1890,
  mrp: 2490,
  brand: "Charmora",
  sku: "CH-JWL-003",
  tags: ["silver ring", "925 silver", "adjustable"],
  images: ["CLOUDINARY_URL_HERE"]
}),
product({
  sellerId,
  name: "Men's Cotton Regular Fit T-Shirt",
  description: `
Premium cotton t-shirt designed for daily casual wear.

Made from breathable fabric with regular fit for all-day comfort.
Suitable for summer and indoor wear.

Care: Machine wash cold. Do not bleach.
`,
  category: categories.menClothing,
  price: 890,
  mrp: 1190,
  brand: "MetroLine",
  sku: "ML-MEN-001",
  tags: ["t-shirt", "cotton", "men wear"],
  images: ["CLOUDINARY_URL_HERE"]
}),
product({
  sellerId,
  name: "Women's Printed Cotton Kurti",
  description: `
Comfortable cotton kurti with elegant printed design.

Suitable for office, daily wear, and casual outings.
Soft fabric ensures comfort throughout the day.

Care: Hand wash recommended for longer fabric life.
`,
  category: categories.womenClothing,
  price: 1390,
  mrp: 1890,
  brand: "MetroLine",
  sku: "ML-WOM-001",
  tags: ["kurti", "cotton", "women wear"],
  images: ["CLOUDINARY_URL_HERE"]
}),
product({
  sellerId,
  name: "Men's Lightweight Running Shoes",
  description: `
Running shoes designed for jogging, walking, and light workouts.

Breathable mesh upper with cushioned EVA sole for shock absorption.
Provides good grip and comfort for daily use.

Care: Clean with dry cloth after use.
`,
  category: categories.menFootwear,
  price: 2690,
  mrp: 3290,
  brand: "ActiveCore",
  sku: "AC-SHOE-001",
  tags: ["running shoes", "men", "sports"],
  images: ["CLOUDINARY_URL_HERE"]
}),
product({
  sellerId,
  name: "Women's Casual Flat Sandals",
  description: `
Comfortable flat sandals suitable for daily wear.

Soft sole with adjustable strap for better fit.
Lightweight design ideal for long walking hours.

Care: Wipe clean with a damp cloth.
`,
  category: categories.womenFootwear,
  price: 1490,
  mrp: 1990,
  brand: "ActiveCore",
  sku: "AC-SANDAL-002",
  tags: ["sandals", "women", "casual"],
  images: ["CLOUDINARY_URL_HERE"]
}),
product({
  sellerId,
  name: "Water Resistant Laptop Backpack",
  description: `
Durable backpack designed for office and travel use.

Supports laptops up to 15.6 inches with padded compartment.
Multiple pockets for organized storage.

Care: Spot clean only.
`,
  category: categories.backpacks,
  price: 2490,
  mrp: 3190,
  brand: "MetroLine",
  sku: "ML-BAG-001",
  tags: ["backpack", "laptop bag", "travel"],
  images: ["CLOUDINARY_URL_HERE"]
}),
product({
  sellerId,
  name: "Genuine Leather Men's Wallet",
  description: `
Compact leather wallet with multiple card slots.

Made from genuine leather with durable stitching.
Slim design suitable for daily use.

Care: Keep away from water for longer durability.
`,
  category: categories.handbagsWallets,
  price: 990,
  mrp: 1490,
  brand: "MetroLine",
  sku: "ML-WALLET-001",
  tags: ["wallet", "leather", "men"],
  images: ["CLOUDINARY_URL_HERE"]
}),
product({
  sellerId,
  name: "Fitness Smartwatch with Heart Rate Monitor",
  description: `
Smartwatch designed for fitness tracking and daily activity monitoring.

Features step count, heart rate tracking, and notification alerts.
Suitable for everyday fitness routines.

Warranty: 6 months manufacturer warranty.
`,
  category: categories.smartWearables,
  price: 3490,
  mrp: 4290,
  brand: "ActiveCore",
  sku: "AC-WATCH-001",
  tags: ["smartwatch", "fitness", "wearable"],
  images: ["CLOUDINARY_URL_HERE"]
}),
product({
  sellerId,
  name: "Unisex Long-Lasting Eau De Parfum – 100ml",
  description: `
Fresh and long-lasting fragrance suitable for both men and women.

Balanced notes for daily wear and special occasions.
Alcohol-based perfume with premium fragrance oils.

Care: Store away from direct sunlight.
`,
  category: categories.fragrances,
  price: 1590,
  mrp: 2190,
  brand: "AuraScent",
  sku: "AS-PERF-001",
  tags: ["perfume", "unisex", "fragrance"],
  images: ["CLOUDINARY_URL_HERE"]
})

    ];

    // Clear old products
    await Product.deleteMany({});
    console.log('🗑️  Old products removed');

    // Insert new products
    const inserted = await Product.insertMany(products);
    console.log('\n' + '='.repeat(70));
    console.log(`✅ SEED COMPLETE!`);
    console.log(`   Total Products Inserted: ${inserted.length}`);
    console.log(`   Seller: ${seller.name} (${seller.email})`);
    console.log('='.repeat(70));

    // Show category distribution
    const categoryStats = {};
    inserted.forEach(p => {
      const catId = p.category.toString();
      categoryStats[catId] = (categoryStats[catId] || 0) + 1;
    });

    console.log('\n📊 Products by Category:');
    for (const [catId, count] of Object.entries(categoryStats)) {
      console.log(`   ${catId}: ${count} products`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Database disconnected');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

seedProducts();
