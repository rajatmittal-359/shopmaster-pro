// backend/seedCategories.js
const mongoose = require('mongoose');
const Category = require('./models/Category');
const User = require('./models/User');
require('dotenv').config();

const categoryData = [
  {
    name: 'Fashion & Apparel',
    description: 'Clothing, ethnic wear, and fashion accessories for all occasions',
    subcategories: [
      { name: "Men's Clothing", description: "T-shirts, Shirts, Jeans, Kurtas, Jackets" },
      { name: "Women's Clothing", description: "Dresses, Sarees, Tops, Bottoms, Ethnic Wear" },
      { name: "Kids Wear", description: "Boys Clothing, Girls Clothing, Infant Wear" },
      { name: "Clothing Accessories", description: "Belts, Ties, Scarves, Caps, Socks" }
    ]
  },
  {
    name: 'Footwear',
    description: 'Shoes, sandals, and casual footwear for men, women, and kids',
    subcategories: [
      { name: "Men's Footwear", description: "Formal Shoes, Casual Shoes, Sports Shoes, Sandals" },
      { name: "Women's Footwear", description: "Heels, Flats, Sneakers, Sandals, Ethnic Footwear" },
      { name: "Kids Footwear", description: "School Shoes, Sports Shoes, Sandals" }
    ]
  },
  {
    name: 'Jewelry & Accessories',
    description: 'Fashion and traditional jewelry for all occasions',
    subcategories: [
      { name: "Artificial Jewelry", description: "Necklaces, Earrings, Bracelets, Rings" },
      { name: "Silver Jewelry", description: "Silver Chains, Bracelets, Anklets" },
      { name: "Lifestyle Accessories", description: "Sunglasses, Hair Accessories, Keychains" }
    ]
  },
  {
    name: 'Bags & Luggage',
    description: 'Backpacks, handbags, wallets, and travel bags',
    subcategories: [
      { name: "Backpacks & Laptop Bags", description: "College Bags, Office Bags, Hiking Bags" },
      { name: "Handbags & Wallets", description: "Women's Handbags, Clutches, Men's Wallets" },
      { name: "Travel & Luggage", description: "Suitcases, Duffel Bags, Travel Accessories" }
    ]
  },
  {
    name: 'Watches & Wearables',
    description: 'Analog, digital, and smartwatches for style and fitness',
    subcategories: [
      { name: "Men's Watches", description: "Analog Watches, Digital Watches, Luxury Watches" },
      { name: "Women's Watches", description: "Bracelet Watches, Fashion Watches, Smart Watches" },
      { name: "Smart Wearables", description: "Fitness Bands, Smartwatches, Activity Trackers" }
    ]
  },
  {
    name: 'Electronics & Accessories',
    description: 'Mobile accessories, audio devices, and tech gadgets',
    subcategories: [
      { name: "Mobile Accessories", description: "Phone Cases, Screen Protectors, Chargers, Power Banks" },
      { name: "Audio Devices", description: "Earphones, Headphones, Speakers, Neckbands" },
      { name: "Tech Gadgets", description: "Smartwatches, Fitness Trackers, Camera Accessories" }
    ]
  },
  {
    name: 'Beauty & Personal Care',
    description: 'Skincare, cosmetics, fragrances, and grooming products',
    subcategories: [
      { name: "Skincare", description: "Face Wash, Moisturizers, Serums, Sunscreen" },
      { name: "Cosmetics & Makeup", description: "Lipstick, Foundation, Kajal, Nail Polish" },
      { name: "Fragrances", description: "Perfumes, Deodorants, Body Mists" },
      { name: "Men's Grooming", description: "Beard Care, Hair Styling, Shaving Essentials" }
    ]
  }
];

async function seedCategories() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected');

    // Get admin user ID
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.error('❌ Admin user not found. Please create admin first.');
      process.exit(1);
    }

    console.log(`✅ Found admin: ${admin.email}`);

    // Clear existing categories
    await Category.deleteMany({});
    console.log('🗑️  Old categories removed');

    let totalMainCategories = 0;
    let totalSubCategories = 0;

    console.log('\n' + '='.repeat(70));
    console.log('📦 CREATING CATEGORIES...');
    console.log('='.repeat(70));

    // Create main categories and subcategories
    for (const mainCat of categoryData) {
      // Create main category
      const createdMainCat = await Category.create({
        name: mainCat.name,
        description: mainCat.description,
        parentCategory: null,
        createdBy: admin._id,
        isActive: true
      });

      totalMainCategories++;
      console.log(`\n📦 ${createdMainCat.name}`);
      console.log(`   ID: ${createdMainCat._id}`);
      console.log(`   Description: ${createdMainCat.description}`);

      // Create subcategories
      for (const subCat of mainCat.subcategories) {
        const createdSubCat = await Category.create({
          name: subCat.name,
          description: subCat.description,
          parentCategory: createdMainCat._id,
          createdBy: admin._id,
          isActive: true
        });

        totalSubCategories++;
        console.log(`   └── ${createdSubCat.name}`);
        console.log(`       ID: ${createdSubCat._id}`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log(`✅ SEED COMPLETE!`);
    console.log(`   Main Categories: ${totalMainCategories}`);
    console.log(`   Subcategories: ${totalSubCategories}`);
    console.log(`   Total: ${totalMainCategories + totalSubCategories}`);
    console.log('='.repeat(70));

    // Print all categories in tree format
    console.log('\n📋 COMPLETE CATEGORY TREE:\n');
    const allCategories = await Category.find()
      .populate('parentCategory', 'name')
      .sort({ name: 1 });
    
    const mainCategories = allCategories.filter(c => !c.parentCategory);
    
    mainCategories.forEach(mainCat => {
      console.log(`\n${mainCat.name}`);
      console.log(`ID: ${mainCat._id}`);
      
      const subs = allCategories.filter(
        c => c.parentCategory && c.parentCategory._id.toString() === mainCat._id.toString()
      );
      
      subs.forEach(sub => {
        console.log(`  └─ ${sub.name} (${sub._id})`);
      });
    });

    await mongoose.disconnect();
    console.log('\n✅ Database disconnected');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    if (err.code === 11000) {
      console.error('💡 TIP: Check for duplicate category names in your data');
    }
    process.exit(1);
  }
}

seedCategories();
