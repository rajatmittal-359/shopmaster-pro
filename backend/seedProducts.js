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
      // ========== FASHION & APPAREL ==========
      
      // Men's Clothing
      product({
        sellerId,
        name: "UrbanFlex Men's Oversized T-Shirt",
        description: "100% cotton oversized t-shirt with breathable fabric.\nComfortable for daily casual wear.",
        category: categories.menClothing,
        price: 799,
        mrp: 999,
        brand: "UrbanFlex",
        sku: "UF-TSHIRT-001",
        tags: ["t-shirt", "casual", "cotton", "oversized", "men"],
        images: img.tshirt
      }),
      product({
        sellerId,
        name: "Classic Blue Slim Fit Jeans",
        description: "Stretchable denim slim fit jeans with 5-pocket styling.\nPerfect for a modern, stylish look.",
        category: categories.menClothing,
        price: 1499,
        mrp: 1799,
        brand: "DenimStyle",
        sku: "DS-JEANS-002",
        tags: ["jeans", "denim", "slim fit", "men", "fashion"],
        images: img.jeans
      }),

      // Women's Clothing
      product({
        sellerId,
        name: "Women's Floral Summer Dress",
        description: "Lightweight floral printed summer dress for daily wear.\nSoft and breathable fabric.",
        category: categories.womenClothing,
        price: 1299,
        mrp: 1599,
        brand: "FloralVibe",
        sku: "FV-DRESS-005",
        tags: ["dress", "floral", "summer", "women", "casual"],
        images: img.dress
      }),

      // ========== FOOTWEAR ==========
      
      product({
        sellerId,
        name: "SprintRun Men's Running Shoes",
        description: "Breathable mesh running shoes with cushioned sole.\nLightweight and comfortable for long runs.",
        category: categories.menFootwear,
        price: 1999,
        mrp: 2499,
        brand: "SprintRun",
        sku: "SR-RUN-006",
        tags: ["running shoes", "men", "sports", "cushioned"],
        images: img.shoes
      }),
      product({
        sellerId,
        name: "StreetKick Casual Sneakers - White",
        description: "Stylish white sneakers with cushioned comfort.\nPerfect for daily walks and casual outings.",
        category: categories.menFootwear,
        price: 1799,
        mrp: 2199,
        brand: "StreetKick",
        sku: "SK-SNEAKERS-007",
        tags: ["sneakers", "white", "casual", "men", "comfort"],
        images: img.sneakers
      }),
      product({
        sellerId,
        name: "Women's Slip-On Sneakers - Pink",
        description: "Lightweight slip-on sneakers with flexible sole.\nStylish and easy to wear.",
        category: categories.womenFootwear,
        price: 1599,
        mrp: 1899,
        brand: "StreetKick",
        sku: "SK-SLIP-010",
        tags: ["sneakers", "pink", "slip-on", "women", "casual"],
        images: img.sneakers
      }),

      // ========== JEWELRY & ACCESSORIES ==========
      
      product({
        sellerId,
        name: "SilverAura Gold-Plated Necklace Set",
        description: "Elegant gold-plated necklace with matching earrings.\nPerfect for special occasions.",
        category: categories.artificialJewelry,
        price: 2499,
        mrp: 2999,
        brand: "SilverAura",
        sku: "SA-NECKLACE-011",
        tags: ["necklace", "gold", "jewelry", "women", "elegant"],
        images: img.necklace
      }),
      product({
        sellerId,
        name: "Everyday Stud Earrings Set - 6 Pairs",
        description: "Daily wear stud earrings set with hypoallergenic metal.\nVariety of styles for daily use.",
        category: categories.artificialJewelry,
        price: 599,
        mrp: 799,
        brand: "SilverAura",
        sku: "SA-EARRINGS-012",
        tags: ["earrings", "stud", "hypoallergenic", "women", "daily"],
        images: img.earrings
      }),

      // ========== BAGS & LUGGAGE ==========
      
      product({
        sellerId,
        name: "MetroLine Laptop Backpack 15.6\"",
        description: "Water-resistant laptop backpack with multi-pockets.\nOrganized storage for daily use.",
        category: categories.backpacks,
        price: 2199,
        mrp: 2599,
        brand: "MetroLine",
        sku: "ML-BACKPACK-015",
        tags: ["backpack", "laptop", "water-resistant", "organizer"],
        images: img.backpack
      }),
      product({
        sellerId,
        name: "Classic Leather Men's Wallet",
        description: "Durable genuine leather wallet with multiple slots.\nCompact and stylish for everyday carry.",
        category: categories.handbagsWallets,
        price: 799,
        mrp: 999,
        brand: "MetroLine",
        sku: "ML-WALLET-016",
        tags: ["wallet", "leather", "men", "compact", "stylish"],
        images: img.wallet
      }),

      // ========== WATCHES & WEARABLES ==========
      
      product({
        sellerId,
        name: "ChronoEdge Men's Analog Watch",
        description: "Premium analog watch with stainless steel build.\nClassic style for formal and casual wear.",
        category: categories.menWatches,
        price: 2899,
        mrp: 3499,
        brand: "ChronoEdge",
        sku: "CE-WATCH-019",
        tags: ["watch", "analog", "men", "stainless steel", "classic"],
        images: img.watch
      }),
      product({
        sellerId,
        name: "Elegance Women's Bracelet Watch",
        description: "Beautiful rose gold women's watch with crystal dial.\nElegant design for any occasion.",
        category: categories.womenWatches,
        price: 2599,
        mrp: 3099,
        brand: "ChronoEdge",
        sku: "CE-BRACELET-020",
        tags: ["bracelet watch", "rose gold", "women", "elegant", "crystal"],
        images: img.watch
      }),
      product({
        sellerId,
        name: "ActiveFit Smartwatch",
        description: "Smartwatch with health tracking and notification alerts.\nModern features for fitness enthusiasts.",
        category: categories.smartWearables,
        price: 3499,
        mrp: 3999,
        brand: "ActiveFit",
        sku: "AF-SMARTWATCH-021",
        tags: ["smartwatch", "health tracking", "notification", "fitness"],
        images: img.smartwatch
      }),

      // ========== ELECTRONICS & ACCESSORIES ==========
      
      product({
        sellerId,
        name: "EchoPods Wireless Earbuds",
        description: "Bluetooth earbuds with long battery backup.\nGreat sound quality for music and calls.",
        category: categories.audioDevices,
        price: 1599,
        mrp: 1999,
        brand: "EchoPods",
        sku: "EP-EARBUDS-022",
        tags: ["earbuds", "wireless", "Bluetooth", "music", "long battery"],
        images: img.earbuds
      }),
      product({
        sellerId,
        name: "BassPro Over-Ear Headphones",
        description: "Comfortable headphones with powerful bass.\nPerfect for immersive audio experience.",
        category: categories.audioDevices,
        price: 1299,
        mrp: 1599,
        brand: "BassPro",
        sku: "BP-HEADPHONES-023",
        tags: ["headphones", "over-ear", "bass", "music", "comfort"],
        images: img.headphones
      }),
      product({
        sellerId,
        name: "PowerPlus 10000mAh Power Bank",
        description: "Fast-charging power bank with LED indicators.\nPortable and reliable for travel.",
        category: categories.mobileAccessories,
        price: 1199,
        mrp: 1499,
        brand: "PowerPlus",
        sku: "PP-POWERBANK-024",
        tags: ["power bank", "fast charging", "portable", "LED", "travel"],
        images: img.powerbank
      }),

      // ========== BEAUTY & PERSONAL CARE ==========
      
      product({
        sellerId,
        name: "FreshMist Unisex Perfume - 100ml",
        description: "Long-lasting fresh fragrance suitable for daily wear.\nLight and refreshing scent.",
        category: categories.fragrances,
        price: 999,
        mrp: 1299,
        brand: "FreshMist",
        sku: "FM-PERFUME-025",
        tags: ["perfume", "unisex", "long-lasting", "fresh", "daily"],
        images: img.perfume
      }),
      product({
        sellerId,
        name: "GlowCare Face Wash - 150ml",
        description: "Oil-control face wash with aloe vera extract.\nGentle formula for all skin types.",
        category: categories.skincare,
        price: 349,
        mrp: 449,
        brand: "GlowCare",
        sku: "GC-FACEWASH-026",
        tags: ["face wash", "oil control", "aloe vera", "gentle", "all skin"],
        images: img.facewash
      }),
      product({
        sellerId,
        name: "HydraSoft Body Lotion - 400ml",
        description: "24-hour moisturizing lotion for smooth skin.\nLightweight and non-greasy.",
        category: categories.skincare,
        price: 499,
        mrp: 599,
        brand: "HydraSoft",
        sku: "HS-LOTION-027",
        tags: ["body lotion", "moisturizing", "lightweight", "non-greasy", "skin care"],
        images: img.lotion
      }),
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
