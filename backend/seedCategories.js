const mongoose = require("mongoose");
const Category = require("./models/Category");
const User = require("./models/User");
require("dotenv").config();

// FINAL Marketplace Categories
const categoryData = [
  {
    name: "Jewellery & Accessories",
    description: "All kinds of fashion and traditional jewelry",
    subcategories: [
      { name: "Necklace & Pendent Sets" },
      { name: "Earrings" },
      { name: "Bangles & Bracelets" },
      { name: "Mangalsutra and Chain" },
      { name: "Rings" },
      { name: "Nose Pins & Nath" },
      { name: "Maang Tikka & Matha Patti" },
      { name: "Hair Accessories" },
      { name: "Kamarbandh & Saree Pins" },
      { name: "Anklets & Bichhiya" }
    ]
  },
  {
    name: "Fashion & Apparel",
    description: "Clothing & fashion accessories",
    subcategories: [
      { name: "Men's Clothing" },
      { name: "Women's Clothing" },
      { name: "Kids Wear" },
      { name: "Ethnic & Festive Wear" },
      { name: "Fashion Accessories" },
      { name: "Winter Wear" },
      { name: "Innerwear & Loungewear" }
    ]
  },

  {
    name: "Footwear",
    description: "Shoes and sandals for everyone",
    subcategories: [
      { name: "Men's Footwear" },
      { name: "Women's Footwear" },
      { name: "Kids Footwear" }
    ]
  },

  {
    name: "Beauty & Personal Care",
    description: "Cosmetics, skincare & grooming",
    subcategories: [
      { name: "Skincare" },
      { name: "Makeup" },
      { name: "Fragrances" },
      { name: "Men's Grooming" }
    ]
  },

  {
    name: "Bags & Travel",
    description: "Handbags, backpacks and travel bags",
    subcategories: [
      { name: "Backpacks" },
      { name: "Handbags & Clutches" },
      { name: "Men's Wallets" },
      { name: "Travel & Luggage" }
    ]
  },

  {
    name: "Electronics & Gadgets",
    description: "Mobile accessories, audio devices and smart tech",
    subcategories: [
      { name: "Mobile Accessories" },
      { name: "Headphones & Audio" },
      { name: "Power Banks & Chargers" },
      { name: "Smart Wearables" },
      { name: "Computer Accessories" }
    ]
  },

  {
    name: "Home & Kitchen",
    description: "Home essentials & kitchen accessories",
    subcategories: [
      { name: "Home Decor" },
      { name: "Kitchen Tools & Serveware" },
      { name: "Storage & Organization" },
      { name: "Lighting & Electricals" },
      { name: "Cleaning Supplies" }
    ]
  },

  {
    name: "Kids & Baby Products",
    description: "Kids toys, care & essentials",
    subcategories: [
      { name: "Toys & Games" },
      { name: "Baby Care Essentials" },
      { name: "School Supplies" }
    ]
  },

  {
    name: "Watches & Wearables",
    description: "Smart & stylish wrist wear",
    subcategories: [
      { name: "Men's Watches" },
      { name: "Women's Watches" },
      { name: "Fitness Bands" }
    ]
  },

  {
    name: "Lifestyle & Gifts",
    description: "Unique gifts and premium lifestyle items",
    subcategories: [
      { name: "Gift Sets" },
      { name: "Showpieces" },
      { name: "Photo Frames" }
    ]
  }
];

async function seedCategories() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🔗 Connected to MongoDB");

    const admin = await User.findOne({ role: "admin" });
    if (!admin) {
      console.error("❌ Admin user not found!");
      process.exit(1);
    }
    console.log(`👑 Admin: ${admin.email}`);

    await Category.deleteMany({});
    console.log("🗑️ Old categories cleared!");

    let totalMain = 0, totalSubs = 0;

    for (const main of categoryData) {
      const mainCategory = await Category.create({
        name: main.name,
        description: main.description,
        parentCategory: null,
        createdBy: admin._id,
        isActive: true,
      });

      totalMain++;
      console.log(`\n📦 Main: ${mainCategory.name}`);

      for (const sub of main.subcategories) {
        await Category.create({
          name: sub.name,
          description: sub.description || "",
          parentCategory: mainCategory._id,
          createdBy: admin._id,
          isActive: true,
        });
        totalSubs++;
        console.log(`   └─ ${sub.name}`);
      }
    }

    console.log("\n🎉 Categories Seeded Successfully!");
    console.log(`🏷️ Main: ${totalMain}, Sub: ${totalSubs}, Total: ${totalMain + totalSubs}`);

    await mongoose.disconnect();
    console.log("🔌 Disconnected from DB");
    process.exit(0);
    
  } catch (err) {
    console.error("🔥 ERROR:", err.message);
    process.exit(1);
  }
}

seedCategories();
