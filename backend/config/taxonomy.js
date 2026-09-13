/**
 * The marketplace's category tree - what can be sold here, in the shape the
 * big Indian marketplaces use, with Google's own name for each branch.
 *
 * RESEARCHED 13 Sep 2026 against: Google Product Taxonomy (the 21 top
 * levels Merchant Center classifies by), Flipkart / Meesho / Myntra / Amazon
 * India's department menus, and what Jaipur actually makes (handicrafts,
 * puja, gourmet). Two levels only - the model allows two - and every name
 * unique across the tree, because the Category model's `name` is unique.
 *
 * `google` is the Google Product Category path (names, which Google accepts
 * as well as ids). Leaves inherit the parent's when they have none. The
 * Merchant feed sends it as <g:google_product_category>; a correct one is
 * the difference between "approved" and "needs review" on a new item.
 *
 * Applied by `node seedCategories.js` (add-only, re-runnable) or through
 * the admin API; the admin can rename, hide or add from the Categories page.
 */
module.exports = [
  {
    name: "Women's Fashion",
    google: 'Apparel & Accessories > Clothing',
    children: [
      ['Sarees', 'Apparel & Accessories > Clothing > Traditional & Ceremonial Clothing > Saris & Lehengas'],
      ['Kurtas & Suits', 'Apparel & Accessories > Clothing > Traditional & Ceremonial Clothing'],
      ['Lehengas & Ghagras', 'Apparel & Accessories > Clothing > Traditional & Ceremonial Clothing > Saris & Lehengas'],
      ['Dress Material', 'Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Textiles > Fabric'],
      ['Dresses & Tops', 'Apparel & Accessories > Clothing > Dresses'],
      ["Women's Jeans & Trousers", 'Apparel & Accessories > Clothing > Pants'],
      ['Dupattas & Stoles', 'Apparel & Accessories > Clothing Accessories > Scarves & Shawls'],
      ['Blouses', 'Apparel & Accessories > Clothing > Shirts & Tops'],
      ['Winter Wear', 'Apparel & Accessories > Clothing > Outerwear'],
      ['Nightwear & Loungewear', 'Apparel & Accessories > Clothing > Sleepwear & Loungewear'],
      ['Lingerie & Innerwear', 'Apparel & Accessories > Clothing > Underwear & Socks'],
      ['Plus Size', 'Apparel & Accessories > Clothing'],
    ],
  },
  {
    name: "Men's Fashion",
    google: 'Apparel & Accessories > Clothing',
    children: [
      ['Shirts', 'Apparel & Accessories > Clothing > Shirts & Tops'],
      ['T-Shirts & Polos', 'Apparel & Accessories > Clothing > Shirts & Tops'],
      ["Men's Ethnic Wear", 'Apparel & Accessories > Clothing > Traditional & Ceremonial Clothing'],
      ['Sherwanis & Wedding Wear', 'Apparel & Accessories > Clothing > Traditional & Ceremonial Clothing'],
      ['Nehru Jackets & Waistcoats', 'Apparel & Accessories > Clothing > Outerwear > Vests'],
      ["Men's Jeans & Trousers", 'Apparel & Accessories > Clothing > Pants'],
      ['Jackets & Sweaters', 'Apparel & Accessories > Clothing > Outerwear'],
      ["Men's Innerwear & Nightwear", 'Apparel & Accessories > Clothing > Underwear & Socks'],
      ['Ties, Belts & Accessories', 'Apparel & Accessories > Clothing Accessories'],
    ],
  },
  {
    name: 'Kids & Baby',
    google: 'Apparel & Accessories > Clothing > Baby & Toddler Clothing',
    children: [
      ["Boys' Clothing", 'Apparel & Accessories > Clothing'],
      ["Girls' Clothing", 'Apparel & Accessories > Clothing'],
      ['Baby Clothing', 'Apparel & Accessories > Clothing > Baby & Toddler Clothing'],
      ["Kids' Ethnic Wear", 'Apparel & Accessories > Clothing > Traditional & Ceremonial Clothing'],
      ['Baby Care & Feeding', 'Baby & Toddler'],
      ['Diapers & Wipes', 'Baby & Toddler > Diapering'],
      ['School Essentials', 'Office Supplies > School Supplies'],
    ],
  },
  {
    name: 'Jewellery',
    google: 'Apparel & Accessories > Jewelry',
    children: [
      ['Earrings', 'Apparel & Accessories > Jewelry > Earrings'],
      ['Necklaces & Pendants', 'Apparel & Accessories > Jewelry > Necklaces'],
      ['Bangles & Bracelets', 'Apparel & Accessories > Jewelry > Bracelets'],
      ['Rings', 'Apparel & Accessories > Jewelry > Rings'],
      ['Anklets & Toe Rings', 'Apparel & Accessories > Jewelry > Anklets'],
      ['Maang Tikka', 'Apparel & Accessories > Jewelry'],
      ['Mangalsutra & Chains', 'Apparel & Accessories > Jewelry > Necklaces'],
      ['Nose Pins & Nath', 'Apparel & Accessories > Jewelry > Body Jewelry'],
      ['Bridal Jewellery Sets', 'Apparel & Accessories > Jewelry > Jewelry Sets'],
      ['Kundan & Polki', 'Apparel & Accessories > Jewelry'],
      ['Oxidised & Silver Jewellery', 'Apparel & Accessories > Jewelry'],
      ['Temple Jewellery', 'Apparel & Accessories > Jewelry'],
      ["Men's Jewellery", 'Apparel & Accessories > Jewelry'],
      ['Hair Accessories & Brooches', 'Apparel & Accessories > Clothing Accessories > Hair Accessories'],
    ],
  },
  {
    name: 'Footwear',
    google: 'Apparel & Accessories > Shoes',
    children: [
      ["Women's Footwear", 'Apparel & Accessories > Shoes'],
      ["Men's Footwear", 'Apparel & Accessories > Shoes'],
      ["Kids' Footwear", 'Apparel & Accessories > Shoes'],
      ['Juttis & Mojaris', 'Apparel & Accessories > Shoes'],
      ['Sandals & Floaters', 'Apparel & Accessories > Shoes'],
      ['Sports Shoes', 'Apparel & Accessories > Shoes'],
    ],
  },
  {
    name: 'Bags & Luggage',
    google: 'Luggage & Bags',
    children: [
      ['Handbags & Clutches', 'Luggage & Bags > Handbags'],
      ['Backpacks', 'Luggage & Bags > Backpacks'],
      ['Potli & Ethnic Bags', 'Luggage & Bags > Handbags'],
      ['Wallets & Card Holders', 'Apparel & Accessories > Handbag & Wallet Accessories > Wallets & Money Clips'],
      ['Trolley Bags & Suitcases', 'Luggage & Bags > Suitcases'],
      ['Laptop & Office Bags', 'Luggage & Bags > Briefcases'],
    ],
  },
  {
    name: 'Watches',
    google: 'Apparel & Accessories > Jewelry > Watches',
    children: [
      ["Men's Watches", 'Apparel & Accessories > Jewelry > Watches'],
      ["Women's Watches", 'Apparel & Accessories > Jewelry > Watches'],
      ["Kids' Watches", 'Apparel & Accessories > Jewelry > Watches'],
      ['Watch Straps & Accessories', 'Apparel & Accessories > Jewelry > Watch Accessories'],
    ],
  },
  {
    name: 'Beauty & Personal Care',
    google: 'Health & Beauty > Personal Care',
    children: [
      ['Skincare', 'Health & Beauty > Personal Care > Cosmetics > Skin Care'],
      ['Makeup', 'Health & Beauty > Personal Care > Cosmetics > Makeup'],
      ['Fragrances', 'Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne'],
      ['Hair Care', 'Health & Beauty > Personal Care > Hair Care'],
      ['Bath & Body', 'Health & Beauty > Personal Care > Cosmetics > Bath & Body'],
      ["Men's Grooming", 'Health & Beauty > Personal Care > Shaving & Grooming'],
      ['Mehndi & Bridal Beauty', 'Health & Beauty > Personal Care > Cosmetics'],
      ['Beauty Tools & Accessories', 'Health & Beauty > Personal Care > Cosmetics > Cosmetic Tools'],
    ],
  },
  {
    name: 'Health & Wellness',
    google: 'Health & Beauty > Health Care',
    children: [
      ['Ayurveda & Herbal', 'Health & Beauty > Health Care'],
      ['Vitamins & Supplements', 'Health & Beauty > Health Care > Fitness & Nutrition > Vitamins & Supplements'],
      ['Fitness Nutrition', 'Health & Beauty > Health Care > Fitness & Nutrition'],
      ['Personal Care Devices', 'Health & Beauty > Health Care'],
      ['Yoga & Meditation', 'Sporting Goods > Exercise & Fitness > Yoga & Pilates'],
      ['First Aid & Health Monitors', 'Health & Beauty > Health Care > Medical Tests & Monitors'],
    ],
  },
  {
    name: 'Electronics',
    google: 'Electronics',
    children: [
      ['Mobile Phones', 'Electronics > Communications > Telephony > Mobile Phones'],
      ['Mobile Accessories', 'Electronics > Communications > Telephony > Mobile Phone Accessories'],
      ['Headphones & Audio', 'Electronics > Audio > Audio Components > Headphones & Headsets'],
      ['Speakers', 'Electronics > Audio > Audio Players & Recorders'],
      ['Chargers & Power Banks', 'Electronics > Electronics Accessories > Power'],
      ['Smart Wearables', 'Electronics > Electronics Accessories'],
      ['Computer Accessories', 'Electronics > Computers > Computer Accessories'],
      ['Cameras & Accessories', 'Cameras & Optics'],
      ['Smart Home', 'Electronics > Electronics Accessories'],
      ['Tablets & E-readers', 'Electronics > Computers > Tablet Computers'],
    ],
  },
  {
    name: 'Home & Kitchen',
    google: 'Home & Garden',
    children: [
      ['Kitchen & Serveware', 'Home & Garden > Kitchen & Dining > Tableware'],
      ['Cookware & Bakeware', 'Home & Garden > Kitchen & Dining > Cookware & Bakeware'],
      ['Storage & Organisers', 'Home & Garden > Household Supplies > Storage & Organization'],
      ['Home Decor', 'Home & Garden > Decor'],
      ['Showpieces', 'Home & Garden > Decor > Figurines'],
      ['Wall Art & Frames', 'Home & Garden > Decor > Artwork'],
      ['Lighting & Lamps', 'Home & Garden > Lighting'],
      ['Bedsheets & Bedding', 'Home & Garden > Linens & Bedding > Bedding'],
      ['Curtains & Cushions', 'Home & Garden > Decor > Window Treatments'],
      ['Bath Linen & Accessories', 'Home & Garden > Bathroom Accessories'],
      ['Cleaning & Household Supplies', 'Home & Garden > Household Supplies'],
      ['Kitchen Appliances', 'Home & Garden > Kitchen & Dining > Kitchen Appliances'],
    ],
  },
  {
    name: 'Furniture',
    google: 'Furniture',
    children: [
      ['Living Room Furniture', 'Furniture > Sofas'],
      ['Bedroom Furniture', 'Furniture > Beds & Accessories'],
      ['Study & Office Furniture', 'Furniture > Office Furniture'],
      ['Outdoor & Balcony Furniture', 'Furniture > Outdoor Furniture'],
      ["Kids' Furniture", 'Furniture > Baby & Toddler Furniture'],
      ['Mattresses & Pillows', 'Home & Garden > Linens & Bedding > Bedding'],
    ],
  },
  {
    name: 'Handicrafts & Art',
    google: 'Home & Garden > Decor',
    children: [
      ['Blue Pottery', 'Home & Garden > Decor > Vases'],
      ['Block Prints & Textiles', 'Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Textiles'],
      ['Marble & Stone Craft', 'Home & Garden > Decor > Figurines'],
      ['Lac & Bangle Craft', 'Apparel & Accessories > Jewelry > Bracelets'],
      ['Paintings & Miniatures', 'Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork'],
      ['Brass & Metal Craft', 'Home & Garden > Decor'],
      ['Wooden Craft', 'Home & Garden > Decor'],
      ['Leather Craft', 'Apparel & Accessories'],
      ['Puppets & Folk Toys', 'Toys & Games > Toys'],
      ['Handmade Paper & Stationery', 'Office Supplies > Paper Handling'],
    ],
  },
  {
    name: 'Puja & Festive',
    google: 'Religious & Ceremonial',
    children: [
      ['Puja Essentials', 'Religious & Ceremonial > Religious Items'],
      ['Idols & Murtis', 'Religious & Ceremonial > Religious Items'],
      ['Diyas & Candles', 'Home & Garden > Decor > Home Fragrances > Candles'],
      ['Incense & Dhoop', 'Home & Garden > Decor > Home Fragrances > Incense'],
      ['Torans & Festive Decor', 'Home & Garden > Decor > Seasonal & Holiday Decorations'],
      ['Rakhi & Festive Gifts', 'Arts & Entertainment > Party & Celebration > Gift Giving'],
      ['Wedding Essentials', 'Religious & Ceremonial > Wedding Ceremony Supplies'],
    ],
  },
  {
    name: 'Gifts',
    google: 'Arts & Entertainment > Party & Celebration > Gift Giving',
    children: [
      ['Gift Sets', 'Arts & Entertainment > Party & Celebration > Gift Giving'],
      ['Personalised Gifts', 'Arts & Entertainment > Party & Celebration > Gift Giving'],
      ['Corporate Gifts', 'Arts & Entertainment > Party & Celebration > Gift Giving'],
      ['Wedding Favours', 'Arts & Entertainment > Party & Celebration > Gift Giving'],
      ['Greeting Cards & Wrapping', 'Arts & Entertainment > Party & Celebration > Gift Giving > Greeting & Note Cards'],
    ],
  },
  {
    name: 'Sports & Fitness',
    google: 'Sporting Goods',
    children: [
      ['Fitness Equipment', 'Sporting Goods > Exercise & Fitness'],
      ['Sportswear & Activewear', 'Apparel & Accessories > Clothing > Activewear'],
      ['Cricket', 'Sporting Goods > Athletics > Cricket'],
      ['Badminton & Racquet Sports', 'Sporting Goods > Athletics > Racquet Sports'],
      ['Cycling', 'Sporting Goods > Outdoor Recreation > Cycling'],
      ['Outdoor & Camping', 'Sporting Goods > Outdoor Recreation > Camping & Hiking'],
    ],
  },
  {
    name: 'Toys & Games',
    google: 'Toys & Games',
    children: [
      ['Educational Toys', 'Toys & Games > Toys > Educational Toys'],
      ['Soft Toys', 'Toys & Games > Toys > Stuffed Animals'],
      ['Board Games & Puzzles', 'Toys & Games > Games'],
      ['Remote Control & Outdoor Toys', 'Toys & Games > Toys > Remote Control Toys'],
      ['Dolls & Action Figures', 'Toys & Games > Toys > Dolls, Playsets & Toy Figures'],
      ['Baby & Toddler Toys', 'Toys & Games > Toys > Baby & Toddler Toys'],
    ],
  },
  {
    name: 'Books & Stationery',
    google: 'Media > Books',
    children: [
      ['Fiction', 'Media > Books > Print Books'],
      ['Non-fiction & Self-help', 'Media > Books > Print Books'],
      ["Children's Books", 'Media > Books > Print Books'],
      ['Academic & Exam Prep', 'Media > Books > Print Books'],
      ['Notebooks & Diaries', 'Office Supplies > Paper Handling'],
      ['Pens & Art Supplies', 'Office Supplies > Office Instruments > Writing & Drawing Instruments'],
      ['Office Supplies', 'Office Supplies'],
    ],
  },
  {
    name: 'Grocery & Gourmet',
    google: 'Food, Beverages & Tobacco > Food Items',
    children: [
      ['Dry Fruits & Nuts', 'Food, Beverages & Tobacco > Food Items > Nuts & Seeds'],
      ['Spices & Masalas', 'Food, Beverages & Tobacco > Food Items > Seasonings & Spices'],
      ['Tea & Coffee', 'Food, Beverages & Tobacco > Beverages > Tea & Infusions'],
      ['Snacks & Namkeen', 'Food, Beverages & Tobacco > Food Items > Snack Foods'],
      ['Sweets & Mithai', 'Food, Beverages & Tobacco > Food Items > Candy & Chocolate'],
      ['Pickles, Chutneys & Papad', 'Food, Beverages & Tobacco > Food Items > Condiments & Sauces'],
      ['Organic & Health Foods', 'Food, Beverages & Tobacco > Food Items'],
      ['Ghee, Oils & Staples', 'Food, Beverages & Tobacco > Food Items > Cooking & Baking Ingredients'],
    ],
  },
  {
    name: 'Pet Supplies',
    google: 'Animals & Pet Supplies > Pet Supplies',
    children: [
      ['Dog Food & Treats', 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Food'],
      ['Cat Food & Treats', 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Food'],
      ['Pet Accessories', 'Animals & Pet Supplies > Pet Supplies'],
      ['Pet Grooming', 'Animals & Pet Supplies > Pet Supplies'],
      ['Birds & Aquarium', 'Animals & Pet Supplies > Pet Supplies'],
    ],
  },
  {
    name: 'Automotive',
    google: 'Vehicles & Parts > Vehicle Parts & Accessories',
    children: [
      ['Car Accessories', 'Vehicles & Parts > Vehicle Parts & Accessories > Motor Vehicle Parts'],
      ['Bike Accessories', 'Vehicles & Parts > Vehicle Parts & Accessories > Motor Vehicle Parts'],
      ['Helmets & Riding Gear', 'Vehicles & Parts > Vehicle Parts & Accessories > Motor Vehicle Parts > Motor Vehicle Rider Protection'],
      ['Car & Bike Care', 'Vehicles & Parts > Vehicle Parts & Accessories > Vehicle Maintenance, Care & Decor'],
    ],
  },
  {
    name: 'Garden & Outdoors',
    google: 'Home & Garden > Lawn & Garden',
    children: [
      ['Plants & Seeds', 'Home & Garden > Lawn & Garden > Gardening > Plants'],
      ['Planters & Pots', 'Home & Garden > Lawn & Garden > Gardening > Pots & Planters'],
      ['Garden Tools', 'Home & Garden > Lawn & Garden > Gardening > Gardening Tools'],
      ['Balcony & Garden Decor', 'Home & Garden > Lawn & Garden > Outdoor Living'],
    ],
  },
  {
    name: 'Musical Instruments',
    google: 'Arts & Entertainment > Hobbies & Creative Arts > Musical Instruments',
    children: [
      ['Guitars & Strings', 'Arts & Entertainment > Hobbies & Creative Arts > Musical Instruments > String Instruments'],
      ['Tabla & Percussion', 'Arts & Entertainment > Hobbies & Creative Arts > Musical Instruments > Percussion'],
      ['Harmonium & Keyboards', 'Arts & Entertainment > Hobbies & Creative Arts > Musical Instruments > Keyboard Instruments'],
      ['Flutes & Wind Instruments', 'Arts & Entertainment > Hobbies & Creative Arts > Musical Instruments > Woodwinds'],
      ['Instrument Accessories', 'Arts & Entertainment > Hobbies & Creative Arts > Musical Instrument & Orchestra Accessories'],
    ],
  },
];
