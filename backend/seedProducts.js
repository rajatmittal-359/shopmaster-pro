// backend/seedProducts.js
const mongoose = require('mongoose');
const Product = require('./models/Product');
require('dotenv').config();
// Yahi use karo jo backend .env me hai
const MONGODB_URI = process.env.MONGO_URI;

// Seller (vijay store)
const sellerId = '692d51dc50caac08e9b435c7'; // users collection wala id

// Category IDs (jo tumne bheje)
const categories = {
  clothing: '6939d211f3c53f525e840a89',
  footwear: '6939d221f3c53f525e840a8f',
  jewelry: '6939d235f3c53f525e840a95',
  bags: '6939d244f3c53f525e840a9b',
  watches: '6939d252f3c53f525e840aa1',
  electronicsAcc: '6939d260f3c53f525e840aa7',
  beauty: '6939d33ef3c53f525e840aad'
};

// Simple placeholder image (1 hi chalega)
const placeholder = 'https://via.placeholder.com/600x600.png?text=Product+Image';

const products = [
  // CLOTHING (5)
  {
    name: "UrbanFlex Men's Oversized T-Shirt",
    description: "100% cotton oversized t-shirt with soft breathable fabric for everyday casual wear.",
    sellerId,
    category: categories.clothing,
    price: 799,
    stock: 150,
    images: [placeholder]
  },
  {
    name: "Classic Blue Slim Fit Jeans",
    description: "Stretchable denim slim fit jeans with mid-rise waist and 5-pocket styling.",
    sellerId,
    category: categories.clothing,
    price: 1499,
    stock: 90,
    images: [placeholder]
  },
  {
    name: "Essential Black Hoodie",
    description: "Fleece-lined hoodie with adjustable drawstring and kangaroo pocket for winters.",
    sellerId,
    category: categories.clothing,
    price: 1299,
    stock: 110,
    images: [placeholder]
  },
  {
    name: "Men's Kurta Set - Beige",
    description: "Cotton blend kurta with matching churidar, perfect for festive and family functions.",
    sellerId,
    category: categories.clothing,
    price: 1999,
    stock: 60,
    images: [placeholder]
  },
  {
    name: "Women's Floral Summer Dress",
    description: "Lightweight knee-length dress with floral print and short sleeves.",
    sellerId,
    category: categories.clothing,
    price: 1299,
    stock: 80,
    images: [placeholder]
  },

  // FOOTWEAR (5)
  {
    name: "SprintRun Men's Running Shoes - Orange",
    description: "Lightweight running shoes with breathable mesh upper and cushioned EVA sole.",
    sellerId,
    category: categories.footwear,
    price: 1999,
    stock: 120,
    images: [placeholder]
  },
  {
    name: "StreetKick Casual Sneakers - White",
    description: "Low-top sneakers with rubber sole and cushioned insole for daily use.",
    sellerId,
    category: categories.footwear,
    price: 1799,
    stock: 140,
    images: [placeholder]
  },
  {
    name: "ComfortWalk Sandals - Brown",
    description: "PU sandals with adjustable straps and soft footbed for all-day comfort.",
    sellerId,
    category: categories.footwear,
    price: 899,
    stock: 100,
    images: [placeholder]
  },
  {
    name: "CourtPro Sports Shoes",
    description: "Multi-purpose sports shoes suitable for gym, walking and light training.",
    sellerId,
    category: categories.footwear,
    price: 1699,
    stock: 95,
    images: [placeholder]
  },
  {
    name: "Women's Slip-On Sneakers - Pink",
    description: "Lightweight slip-on sneakers with knit upper and flexible sole.",
    sellerId,
    category: categories.footwear,
    price: 1599,
    stock: 85,
    images: [placeholder]
  },

  // JEWELRY (4)
  {
    name: "SilverAura Gold-Plated Necklace Set",
    description: "Traditional necklace with matching earrings, ideal for weddings and festivals.",
    sellerId,
    category: categories.jewelry,
    price: 2499,
    stock: 50,
    images: [placeholder]
  },
  {
    name: "Everyday Stud Earrings Set - 6 Pairs",
    description: "Pack of 6 hypoallergenic stud earrings for daily office and college wear.",
    sellerId,
    category: categories.jewelry,
    price: 599,
    stock: 200,
    images: [placeholder]
  },
  {
    name: "Elegant Stone Bracelet",
    description: "Adjustable bracelet with crystal stones and metal chain.",
    sellerId,
    category: categories.jewelry,
    price: 899,
    stock: 120,
    images: [placeholder]
  },
  {
    name: "Classic Finger Ring - Adjustable",
    description: "Gold-plated adjustable ring with minimalist design.",
    sellerId,
    category: categories.jewelry,
    price: 499,
    stock: 180,
    images: [placeholder]
  },

  // BAGS & WALLETS (4)
  {
    name: "MetroLine Laptop Backpack 15.6\"",
    description: "Water-resistant laptop backpack with padded compartment and multiple pockets.",
    sellerId,
    category: categories.bags,
    price: 2199,
    stock: 70,
    images: [placeholder]
  },
  {
    name: "Classic Leather Men's Wallet",
    description: "Genuine leather wallet with multiple card slots and coin pocket.",
    sellerId,
    category: categories.bags,
    price: 799,
    stock: 150,
    images: [placeholder]
  },
  {
    name: "Women's Sling Bag - Tan",
    description: "Compact sling bag with magnetic closure and adjustable strap.",
    sellerId,
    category: categories.bags,
    price: 1299,
    stock: 90,
    images: [placeholder]
  },
  {
    name: "Travel Duffle Bag - Navy",
    description: "Spacious duffle bag for weekend trips with shoulder strap.",
    sellerId,
    category: categories.bags,
    price: 1899,
    stock: 55,
    images: [placeholder]
  },

  // WATCHES (3)
  {
    name: "ChronoEdge Men's Analog Watch",
    description: "Stainless steel analog watch with date display and 30m water resistance.",
    sellerId,
    category: categories.watches,
    price: 2899,
    stock: 60,
    images: [placeholder]
  },
  {
    name: "Elegance Women's Bracelet Watch",
    description: "Rose gold bracelet watch with crystal-studded dial.",
    sellerId,
    category: categories.watches,
    price: 2599,
    stock: 65,
    images: [placeholder]
  },
  {
    name: "ActiveFit Smartwatch",
    description: "Fitness smartwatch with heart rate monitoring and step tracking.",
    sellerId,
    category: categories.watches,
    price: 3499,
    stock: 40,
    images: [placeholder]
  },

  // ELECTRONICS ACCESSORIES (3)
  {
    name: "EchoPods Wireless Earbuds",
    description: "Bluetooth 5.3 earbuds with 30 hours battery backup and fast charging.",
    sellerId,
    category: categories.electronicsAcc,
    price: 1599,
    stock: 130,
    images: [placeholder]
  },
  {
    name: "BassPro Over-Ear Headphones",
    description: "Wired over-ear headphones with deep bass and comfortable cushioning.",
    sellerId,
    category: categories.electronicsAcc,
    price: 1299,
    stock: 90,
    images: [placeholder]
  },
  {
    name: "PowerPlus 10000mAh Power Bank",
    description: "Fast-charging power bank with dual USB output and LED indicators.",
    sellerId,
    category: categories.electronicsAcc,
    price: 1199,
    stock: 150,
    images: [placeholder]
  },

  // BEAUTY & PERSONAL CARE (3)
  {
    name: "FreshMist Unisex Perfume - 100ml",
    description: "Long-lasting citrus fragrance suitable for daily office wear.",
    sellerId,
    category: categories.beauty,
    price: 999,
    stock: 120,
    images: [placeholder]
  },
  {
    name: "GlowCare Face Wash - 150ml",
    description: "Oil-control face wash with aloe vera and vitamin E.",
    sellerId,
    category: categories.beauty,
    price: 349,
    stock: 200,
    images: [placeholder]
  },
  {
    name: "HydraSoft Body Lotion - 400ml",
    description: "Moisturizing body lotion for all skin types with 24-hour hydration.",
    sellerId,
    category: categories.beauty,
    price: 499,
    stock: 160,
    images: [placeholder]
  }
];

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('DB connected');

    await Product.deleteMany({});
    console.log('Old products removed');

    await Product.insertMany(products);
    console.log('Products inserted:', products.length);
  } catch (err) {
    console.error('Seed error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed();
