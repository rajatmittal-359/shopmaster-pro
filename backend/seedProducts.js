const mongoose = require('mongoose');
const Product = require('./models/Product');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI;
console.log('MONGODB_URI =', MONGODB_URI);

// Seller ID (Vijay Store seller)
const sellerId = "693aa7a1b0eae33c90ce25ae";

// Category IDs – exactly same as your existing file
const categories = {
  clothing: "6939d211f3c53f525e840a89",
  footwear: "6939d221f3c53f525e840a8f",
  jewelry: "6939d235f3c53f525e840a95",
  bags: "6939d244f3c53f525e840a9b",
  watches: "6939d252f3c53f525e840aa1",
  electronicsAcc: "6939d260f3c53f525e840aa7",
  beauty: "6939d33ef3c53f525e840aad"
};

// Helper – adds default fields matching Product model
function product(p) {
  return {
    ...p,
    isActive: true,
    lowStockThreshold: 10,
    avgRating: 0,
    totalReviews: 0
  };
}

// Realistic image sets (Unsplash / similar)
const img = {
  tshirt: [
    "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1521572162944-9ffdc0e3f77b?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=600&q=80"
  ],
  jeans: [
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1514996937319-344454492b37?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=600&q=80"
  ],
  hoodie: [
    "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80"
  ],
  kurta: [
    "https://images.unsplash.com/photo-1593032465175-0c581f3866d4?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1602810318383-5d1a895f02aa?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=600&q=80"
  ],
  dress: [
    "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1495121553079-4c61bcce189c?auto=format&fit=crop&w=600&q=80"
  ],
  runningShoes: [
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1612810432633-96f64dc8ccb6?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1539185441755-769473a23570?auto=format&fit=crop&w=600&q=80"
  ],
  sneakers: [
    "https://images.unsplash.com/photo-1519744792095-2f2205e87b6f?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80"
  ],
  sandals: [
    "https://images.unsplash.com/photo-1504280390368-3971a020f5ca?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1514986888952-8cd320577b68?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?auto=format&fit=crop&w=600&q=80"
  ],
  sportsShoes: [
    "https://images.unsplash.com/photo-1539185441755-769473a23570?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80"
  ],
  necklace: [
    "https://images.unsplash.com/photo-1582060114903-429563460656?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80"
  ],
  earrings: [
    "https://images.unsplash.com/photo-1617038260897-41a9a2c94a08?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1600093463592-9f61807aef11?auto=format&fit=crop&w=600&q=80"
  ],
  bracelet: [
    "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1502301197179-65228ab57f78?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1543294001-f7cd5d7fb516?auto=format&fit=crop&w=600&q=80"
  ],
  ring: [
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=600&q=80"
  ],
  backpack: [
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1516478177764-9fe5bdc5aff3?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=600&q=80"
  ],
  wallet: [
    "https://images.unsplash.com/photo-1511391037251-0c6fcef2e63b?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1612810432633-96f64dc8ccb6?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=600&q=80"
  ],
  slingBag: [
    "https://images.unsplash.com/photo-1528701800489-20be3c30c1d5?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80"
  ],
  duffle: [
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1500534314211-0a24cd03f2c0?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80"
  ],
  mensWatch: [
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1508682642025-0c0be9c779b1?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80"
  ],
  womensWatch: [
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=600&q=80"
  ],
  smartwatch: [
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80"
  ],
  earbuds: [
    "https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1518445699930-711f50cebbf0?auto=format&fit=crop&w=600&q=80"
  ],
  headphones: [
    "https://images.unsplash.com/photo-1512663150964-d8f925fe2c88?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1516908205727-40afad9449a0?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=600&q=80"
  ],
  powerbank: [
    "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1518445699930-711f50cebbf0?auto=format&fit=crop&w=600&q=80"
  ],
  perfume: [
    "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1612810432633-96f64dc8ccb6?auto=format&fit=crop&w=600&q=80"
  ],
  facewash: [
    "https://images.unsplash.com/photo-1612810432633-96f64dc8ccb6?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1601049313729-4726f814104c?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=600&q=80"
  ],
  lotion: [
    "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1601049313729-4726f814104c?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1612810432633-96f64dc8ccb6?auto=format&fit=crop&w=600&q=80"
  ]
};

const products = [
  // CLOTHING
  product({
    sellerId,
    name: "UrbanFlex Men's Oversized T-Shirt",
    description: "100% cotton oversized t-shirt with breathable fabric.\nComfortable for daily casual wear.",
    category: categories.clothing,
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
    category: categories.clothing,
    price: 1499,
    mrp: 1799,
    brand: "DenimStyle",
    sku: "DS-JEANS-002",
    tags: ["jeans", "denim", "slim fit", "men", "fashion"],
    images: img.jeans
  }),
  product({
    sellerId,
    name: "Essential Black Hoodie",
    description: "Fleece-lined hoodie with drawstring and warm interior.\nIdeal for chilly weather.",
    category: categories.clothing,
    price: 1299,
    mrp: 1599,
    brand: "UrbanFlex",
    sku: "UF-HOODIE-003",
    tags: ["hoodie", "fleece", "black", "casual", "unisex"],
    images: img.hoodie
  }),
  product({
    sellerId,
    name: "Men's Kurta Set - Beige",
    description: "Cotton blend kurta set ideal for festive and ethnic occasions.\nElegant design with comfortable fit.",
    category: categories.clothing,
    price: 1999,
    mrp: 2499,
    brand: "EthnicWeave",
    sku: "EW-KURTA-004",
    tags: ["kurta", "ethnic", "cotton", "men", "festive"],
    images: img.kurta
  }),
  product({
    sellerId,
    name: "Women's Floral Summer Dress",
    description: "Lightweight floral printed summer dress for daily wear.\nSoft and breathable fabric.",
    category: categories.clothing,
    price: 1299,
    mrp: 1599,
    brand: "FloralVibe",
    sku: "FV-DRESS-005",
    tags: ["dress", "floral", "summer", "women", "casual"],
    images: img.dress
  }),

  // FOOTWEAR
  product({
    sellerId,
    name: "SprintRun Men's Running Shoes - Orange",
    description: "Breathable mesh running shoes with cushioned sole.\nLightweight and comfortable for long runs.",
    category: categories.footwear,
    price: 1999,
    mrp: 2499,
    brand: "SprintRun",
    sku: "SR-RUN-006",
    tags: ["running shoes", "men", "orange", "sports", "cushioned"],
    images: img.runningShoes
  }),
  product({
    sellerId,
    name: "StreetKick Casual Sneakers - White",
    description: "Stylish white sneakers with cushioned comfort.\nPerfect for daily walks and casual outings.",
    category: categories.footwear,
    price: 1799,
    mrp: 2199,
    brand: "StreetKick",
    sku: "SK-SNEAKERS-007",
    tags: ["sneakers", "white", "casual", "men", "comfort"],
    images: img.sneakers
  }),
  product({
    sellerId,
    name: "ComfortWalk Sandals - Brown",
    description: "All-day comfort sandals with soft PU footbed.\nIdeal for beach and casual wear.",
    category: categories.footwear,
    price: 899,
    mrp: 1199,
    brand: "ComfortWalk",
    sku: "CW-SANDALS-008",
    tags: ["sandals", "brown", "comfort", "casual", "unisex"],
    images: img.sandals
  }),
  product({
    sellerId,
    name: "CourtPro Sports Shoes",
    description: "Durable multi-purpose sports shoes for training.\nSuitable for gym and outdoor sports.",
    category: categories.footwear,
    price: 1699,
    mrp: 1999,
    brand: "CourtPro",
    sku: "CP-SHOES-009",
    tags: ["sports shoes", "training", "durable", "men", "gym"],
    images: img.sportsShoes
  }),
  product({
    sellerId,
    name: "Women's Slip-On Sneakers - Pink",
    description: "Lightweight slip-on sneakers with flexible sole.\nStylish and easy to wear.",
    category: categories.footwear,
    price: 1599,
    mrp: 1899,
    brand: "StreetKick",
    sku: "SK-SLIP-010",
    tags: ["sneakers", "pink", "slip-on", "women", "casual"],
    images: img.sneakers
  }),

  // JEWELRY
  product({
    sellerId,
    name: "SilverAura Gold-Plated Necklace Set",
    description: "Elegant gold-plated necklace with matching earrings.\nPerfect for special occasions.",
    category: categories.jewelry,
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
    category: categories.jewelry,
    price: 599,
    mrp: 799,
    brand: "SilverAura",
    sku: "SA-EARRINGS-012",
    tags: ["earrings", "stud", "hypoallergenic", "women", "daily"],
    images: img.earrings
  }),
  product({
    sellerId,
    name: "Elegant Stone Bracelet",
    description: "Beautiful metal bracelet with premium stone design.\nHandcrafted for a unique look.",
    category: categories.jewelry,
    price: 899,
    mrp: 1199,
    brand: "SilverAura",
    sku: "SA-BRACELET-013",
    tags: ["bracelet", "stone", "handcrafted", "women", "jewelry"],
    images: img.bracelet
  }),
  product({
    sellerId,
    name: "Classic Finger Ring - Adjustable",
    description: "Premium adjustable finger ring with elegant finish.\nSuitable for all finger sizes.",
    category: categories.jewelry,
    price: 499,
    mrp: 699,
    brand: "SilverAura",
    sku: "SA-RING-014",
    tags: ["ring", "adjustable", "elegant", "men", "women"],
    images: img.ring
  }),

  // BAGS
  product({
    sellerId,
    name: "MetroLine Laptop Backpack 15.6\"",
    description: "Water-resistant laptop backpack with multi-pockets.\nOrganized storage for daily use.",
    category: categories.bags,
    price: 2199,
    mrp: 2599,
    brand: "MetroLine",
    sku: "ML-BACKPACK-015",
    tags: ["backpack", "laptop", "water-resistant", "men", "organizer"],
    images: img.backpack
  }),
  product({
    sellerId,
    name: "Classic Leather Men's Wallet",
    description: "Durable genuine leather wallet with multiple slots.\nCompact and stylish for everyday carry.",
    category: categories.bags,
    price: 799,
    mrp: 999,
    brand: "MetroLine",
    sku: "ML-WALLET-016",
    tags: ["wallet", "leather", "men", "compact", "stylish"],
    images: img.wallet
  }),
  product({
    sellerId,
    name: "Women's Sling Bag - Tan",
    description: "Compact and stylish sling bag with adjustable strap.\nPerfect for travel and casual outings.",
    category: categories.bags,
    price: 1299,
    mrp: 1599,
    brand: "MetroLine",
    sku: "ML-SLING-017",
    tags: ["sling bag", "tan", "women", "compact", "travel"],
    images: img.slingBag
  }),
  product({
    sellerId,
    name: "Travel Duffle Bag - Navy",
    description: "Spacious duffle bag ideal for travel & gym.\nDurable and easy to carry.",
    category: categories.bags,
    price: 1899,
    mrp: 2199,
    brand: "MetroLine",
    sku: "ML-DUFFLE-018",
    tags: ["duffle bag", "navy", "travel", "gym", "spacious"],
    images: img.duffle
  }),

  // WATCHES
  product({
    sellerId,
    name: "ChronoEdge Men's Analog Watch",
    description: "Premium analog watch with stainless steel build.\nClassic style for formal and casual wear.",
    category: categories.watches,
    price: 2899,
    mrp: 3499,
    brand: "ChronoEdge",
    sku: "CE-WATCH-019",
    tags: ["watch", "analog", "men", "stainless steel", "classic"],
    images: img.mensWatch
  }),
  product({
    sellerId,
    name: "Elegance Women's Bracelet Watch",
    description: "Beautiful rose gold women's watch with crystal dial.\nElegant design for any occasion.",
    category: categories.watches,
    price: 2599,
    mrp: 3099,
    brand: "ChronoEdge",
    sku: "CE-BRACELET-020",
    tags: ["bracelet watch", "rose gold", "women", "elegant", "crystal"],
    images: img.womensWatch
  }),
  product({
    sellerId,
    name: "ActiveFit Smartwatch",
    description: "Smartwatch with health tracking and notification alerts.\nModern features for fitness enthusiasts.",
    category: categories.watches,
    price: 3499,
    mrp: 3999,
    brand: "ActiveFit",
    sku: "AF-SMARTWATCH-021",
    tags: ["smartwatch", "health tracking", "notification", "men", "women"],
    images: img.smartwatch
  }),

  // ELECTRONICS ACCESSORIES
  product({
    sellerId,
    name: "EchoPods Wireless Earbuds",
    description: "Bluetooth earbuds with long battery backup.\nGreat sound quality for music and calls.",
    category: categories.electronicsAcc,
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
    category: categories.electronicsAcc,
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
    category: categories.electronicsAcc,
    price: 1199,
    mrp: 1499,
    brand: "PowerPlus",
    sku: "PP-POWERBANK-024",
    tags: ["power bank", "fast charging", "portable", "LED", "travel"],
    images: img.powerbank
  }),

  // BEAUTY
  product({
    sellerId,
    name: "FreshMist Unisex Perfume - 100ml",
    description: "Long-lasting fresh fragrance suitable for daily wear.\nLight and refreshing scent.",
    category: categories.beauty,
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
    category: categories.beauty,
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
    category: categories.beauty,
    price: 499,
    mrp: 599,
    brand: "HydraSoft",
    sku: "HS-LOTION-027",
    tags: ["body lotion", "moisturizing", "lightweight", "non-greasy", "skin care"],
    images: img.lotion
  })
];

// Seed runner
async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB connected");

    await Product.deleteMany({});
    console.log("Old products removed");

    await Product.insertMany(products);
    console.log("Inserted products:", products.length);

    await mongoose.disconnect();
    console.log("Done!");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

seed();
