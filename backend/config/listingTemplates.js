/**
 * Category listing templates (21 Sep 2026) - ONE source of truth for what a
 * listing in a category must say.
 *
 * WHY
 *   Amazon, Flipkart and Myntra do not have "a product form"; they have a
 *   product TYPE, and the type decides the questions (Amazon's attribute
 *   sheets, Shopify's metafields, Meesho's 6-8 questions per category). Ours
 *   asked every seller the same seven cards, and the AI wrote from words
 *   alone - so a bedsheet never said its thread count and a necklace never
 *   said its plating, which is exactly what shoppers filter on.
 *
 * WHAT READS THIS
 *   the seller form (attribute fields per category), utils/ai/listing (the
 *   schema the model must fill, the title formula, what it may never claim),
 *   the product page (Highlights table), the shop (facets), the Google feed
 *   (material / pattern / product_detail) and the listing score (required
 *   attributes missing).
 *
 * WHERE THE OPTIONS COME FROM
 *   Flipkart's live filter facets, read 21 Sep 2026 with Firecrawl:
 *   jewellery (Base Material, Plating, Stone Type, Type, Occasion, Ideal for,
 *   Collection), kurta sets (Fabric, Pattern, Sleeve, Neck, Length, Occasion,
 *   Type, Ideal for), bedsheets (Material, Size, Type, Thread Count, Pattern,
 *   incl. "Jaipuri Prints"). Titles follow the same pages' formula: facts left
 *   to right, most-searched first, no adjectives - and Amazon's 2025 title
 *   policy (<= 200 chars, no word more than twice, no price or promo).
 *   Legal lines: Legal Metrology (Packaged Commodities) Rules for e-commerce -
 *   manufacturer/packer, net quantity, MRP, country of origin, and mfg /
 *   best-before dates for anything consumed or applied (2017 amendment).
 *
 * A template is DATA. Adding a category means adding an entry, not code.
 */

const sel = (key, label, options, extra = {}) => ({ key, label, type: 'select', options, ...extra });
const multi = (key, label, options, extra = {}) => ({ key, label, type: 'multi', options, ...extra });
const text = (key, label, extra = {}) => ({ key, label, type: 'text', max: 120, ...extra });

const OCCASION = ['Casual', 'Daily Wear', 'Office', 'Party', 'Festive', 'Wedding', 'Traditional', 'Gifting'];
const IDEAL_FOR = ['Women', 'Men', 'Girls', 'Boys', 'Kids', 'Unisex', 'Couples'];

const TEMPLATES = {
  jewellery: {
    key: 'jewellery',
    label: 'Jewellery',
    productTypes: ['Necklace Set', 'Necklace', 'Choker Set', 'Earrings', 'Jhumkas', 'Bangles', 'Bracelet', 'Ring', 'Anklet', 'Maang Tikka', 'Mangalsutra', 'Nose Pin', 'Nath', 'Bridal Set', 'Pendant', 'Chain', 'Hair Accessory', 'Brooch'],
    attributes: [
      sel('baseMaterial', 'Base material', ['Alloy', 'Brass', 'Copper', 'German Silver', 'Stainless Steel', 'Lac', 'Resin', 'Thread', 'Beads', 'Fabric'], { required: true }),
      sel('plating', 'Plating / finish', ['Gold Plated', 'Rose Gold Plated', 'Silver Plated', 'Rhodium Plated', 'Oxidised', 'Antique Gold', 'Matte Gold', 'Meenakari', 'None'], { required: true }),
      sel('stoneType', 'Stone / work', ['American Diamond (AD)', 'Cubic Zirconia (CZ)', 'Kundan', 'Polki', 'Pearl', 'Meenakari', 'Crystal', 'Glass', 'Beads', 'Thewa', 'Temple', 'Mirror', 'None'], { required: true }),
      multi('occasion', 'Occasion', OCCASION),
      sel('idealFor', 'Ideal for', IDEAL_FOR),
      sel('collection', 'Style', ['Ethnic', 'Traditional', 'Contemporary', 'Fusion', 'Bridal', 'Office', 'Minimal', 'Boho', 'Vintage']),
      sel('closure', 'Closure', ['Adjustable Thread (Dori)', 'Hook', 'Lobster Clasp', 'Push Back', 'Screw Back', 'Slip-on', 'Toggle', 'None']),
      text('setContents', 'What is in the set', { hint: '1 Necklace + 2 Earrings + 1 Maang Tikka', max: 80 }),
      text('length', 'Length / size', { hint: 'Necklace 16 in · adjustable up to 18 in · bangle size 2.6', max: 60 }),
      text('careInstructions', 'Care', { hint: 'Keep away from water and perfume; store in the box', max: 200 }),
    ],
    title: ['baseMaterial', 'plating', 'stoneType', '$color', '$productType'],
    bullets: ['what it is and the set contents', 'material, plating and stone - honestly, "imitation"', 'occasion and what to pair it with', 'size / closure / adjustability', 'care and packing'],
    legal: ['manufacturer', 'countryOfOrigin', 'netQuantity'],
    neverClaim: ['carat', 'purity', '916', 'hallmark', 'sterling', 'real gold', 'real diamond', 'natural stone', 'genuine'],
    mustSay: 'one plain sentence that it is imitation / fashion jewellery',
    seoSeeds: ['artificial jewellery', 'imitation jewellery', 'ad necklace set', 'kundan set', 'jhumka', 'oxidised earrings', 'bridal jewellery set', 'jewellery set for women', 'wedding jewellery', 'traditional jewellery'],
    feed: { material: ['baseMaterial', 'plating'], pattern: [], product_detail: ['stoneType', 'closure', 'length'] },
  },

  apparel: {
    key: 'apparel',
    label: 'Clothing',
    productTypes: ['Kurta', 'Kurti', 'Kurta Set', 'Kurta Palazzo Set', 'Anarkali', 'Saree', 'Lehenga', 'Dress', 'Top', 'Shirt', 'T-Shirt', 'Jeans', 'Trousers', 'Co-ord Set', 'Dupatta', 'Blouse', 'Nightwear', 'Jacket', 'Sherwani', 'Nehru Jacket', 'Sweater'],
    attributes: [
      sel('fabric', 'Fabric', ['Pure Cotton', 'Cotton Blend', 'Rayon', 'Viscose Rayon', 'Silk', 'Silk Blend', 'Georgette', 'Chiffon', 'Linen', 'Khadi', 'Polyester', 'Crepe', 'Chanderi', 'Muslin', 'Denim', 'Wool', 'Net', 'Organza', 'Velvet'], { required: true }),
      sel('pattern', 'Pattern', ['Solid', 'Printed', 'Embroidered', 'Floral', 'Geometric', 'Striped', 'Checked', 'Tie-Dye', 'Block Print', 'Bandhani', 'Leheriya', 'Ikat', 'Embellished', 'Abstract', 'Animal Print'], { required: true }),
      sel('sleeve', 'Sleeve', ['Sleeveless', 'Cap Sleeve', 'Half Sleeve', '3/4 Sleeve', 'Full Sleeve', 'Raglan Sleeve', 'Not applicable']),
      sel('neck', 'Neck', ['Round Neck', 'V Neck', 'Square Neck', 'Boat Neck', 'Collared', 'Mandarin Collar', 'Keyhole Neck', 'Sweetheart Neck', 'Not applicable']),
      sel('length', 'Length', ['Short', 'Medium', 'Long', 'Knee Length', 'Ankle Length', 'Floor Length', 'Not applicable']),
      sel('fit', 'Fit', ['Regular', 'Slim', 'Relaxed', 'Straight', 'A-Line', 'Flared', 'Oversized']),
      multi('occasion', 'Occasion', OCCASION),
      sel('idealFor', 'Ideal for', ['Women', 'Men', 'Girls', 'Boys', 'Unisex', 'Plus Size']),
      text('setContents', 'What is in the set', { hint: 'Kurta + Palazzo + Dupatta', max: 80 }),
      text('careInstructions', 'Wash care', { hint: 'Gentle machine wash cold, dry in shade', max: 200 }),
    ],
    title: ['$idealFor', 'fabric', 'pattern', '$productType', 'setContents'],
    bullets: ['what it is and what is in the set', 'fabric and feel, honestly', 'fit, length, neck, sleeve', 'occasion and how to style it', 'wash care'],
    legal: ['manufacturer', 'countryOfOrigin', 'netQuantity'],
    neverClaim: ['100% pure silk unless stated', 'handloom unless stated', 'organic unless certified'],
    seoSeeds: ['kurti for women', 'cotton kurta set', 'kurta palazzo set', 'party wear kurti', 'office wear kurti', 'anarkali kurta', 'jaipuri print kurti', 'ethnic set', 'saree for women', 'co-ord set'],
    feed: { material: ['fabric'], pattern: ['pattern'], product_detail: ['sleeve', 'neck', 'length', 'fit'] },
  },

  'home-textiles': {
    key: 'home-textiles',
    label: 'Bedsheets, curtains & linen',
    productTypes: ['Bedsheet', 'Fitted Bedsheet', 'Bed Cover', 'Dohar', 'Quilt', 'Comforter', 'Blanket', 'Pillow Cover', 'Cushion Cover', 'Curtain', 'Table Cover', 'Towel', 'Bath Mat', 'Diwan Set'],
    attributes: [
      sel('material', 'Material', ['Cotton', 'Pure Cotton', 'Cotton Blend', 'Microfiber', 'Polyester', 'Polycotton', 'Satin', 'Silk', 'Linen', 'Velvet', 'Jute'], { required: true }),
      sel('size', 'Size', ['Single', 'Double', 'Queen', 'King', 'Super King', 'Standard', 'Custom'], { required: true }),
      sel('type', 'Type', ['Flat', 'Fitted', 'Elastic Fitted', 'Not applicable']),
      sel('threadCount', 'Thread count', ['104 TC', '120 TC', '144 TC', '160 TC', '180 TC', '186 TC', '200 TC', '210 TC', '220 TC', '250 TC', '300 TC', '400 TC', 'Not stated']),
      sel('pattern', 'Pattern', ['Solid', 'Printed', 'Floral', 'Jaipuri Prints', 'Sanganeri Print', 'Block Print', 'Geometric', 'Striped', 'Checked', 'Abstract', 'Kids / Cartoon']),
      text('dimensions', 'Dimensions', { hint: '90 x 108 in (228 x 274 cm)', max: 60 }),
      text('setContents', 'What is in the pack', { hint: '1 Bedsheet with 2 Pillow Covers', max: 80, required: true }),
      text('careInstructions', 'Wash care', { hint: 'Machine wash cold, do not bleach', max: 200 }),
    ],
    title: ['material', 'size', 'type', 'threadCount', 'pattern', '$productType', 'setContents'],
    bullets: ['what it is and the pack contents', 'material and thread count, honestly', 'exact size in inches and cm', 'colour fastness / print', 'wash care'],
    legal: ['manufacturer', 'countryOfOrigin', 'netQuantity'],
    neverClaim: ['thread count higher than stated on the pack', 'Egyptian cotton unless certified'],
    seoSeeds: ['cotton bedsheet double bed', 'jaipuri bedsheet', 'king size bedsheet with pillow covers', 'fitted bedsheet', 'cotton dohar', 'cushion covers set of 5', 'door curtains', 'bedsheet for double bed'],
    feed: { material: ['material'], pattern: ['pattern'], product_detail: ['threadCount', 'type', 'dimensions'] },
  },

  beauty: {
    key: 'beauty',
    label: 'Beauty & personal care',
    productTypes: ['Lipstick', 'Kajal', 'Foundation', 'Compact', 'Face Wash', 'Face Cream', 'Serum', 'Sunscreen', 'Shampoo', 'Hair Oil', 'Perfume', 'Deodorant', 'Body Lotion', 'Soap', 'Mehndi', 'Nail Polish', 'Beauty Tool'],
    attributes: [
      sel('formulation', 'Formulation', ['Cream', 'Gel', 'Liquid', 'Powder', 'Stick', 'Oil', 'Serum', 'Spray', 'Bar', 'Sheet', 'Balm', 'Not applicable']),
      sel('skinType', 'Skin / hair type', ['All', 'Dry', 'Oily', 'Combination', 'Sensitive', 'Normal', 'Curly', 'Frizzy', 'Not applicable']),
      text('shade', 'Shade / variant', { hint: 'Ruby Red 04', max: 60 }),
      multi('concern', 'Concern', ['Hydration', 'Acne', 'Pigmentation', 'Anti-ageing', 'Sun protection', 'Hair fall', 'Dandruff', 'Tan', 'Dullness', 'Long wear']),
      multi('preference', 'Preference', ['Vegan', 'Cruelty-free', 'Paraben-free', 'Sulphate-free', 'Fragrance-free', 'Ayurvedic', 'Dermatologically tested']),
      text('ingredients', 'Key ingredients', { hint: 'As printed on the pack', max: 300, required: true }),
      text('shelfLife', 'Shelf life / best before', { hint: '24 months from manufacture', max: 60, required: true }),
      text('howToUse', 'How to use', { max: 200 }),
    ],
    title: ['$brand', '$productType', 'shade', 'formulation', '$netQuantity'],
    bullets: ['what it is and what it does', 'key ingredients and who it is for', 'how to use', 'texture / finish / wear', 'pack size and shelf life'],
    legal: ['manufacturer', 'countryOfOrigin', 'netQuantity', 'mfgDate', 'bestBefore', 'ingredients'],
    neverClaim: ['cures', 'treats', 'medical', 'permanent', 'clinically proven unless the pack says so', 'whitening'],
    seoSeeds: ['lipstick matte long lasting', 'kajal waterproof', 'face wash for oily skin', 'sunscreen spf 50', 'hair oil for hair fall', 'perfume for women long lasting', 'herbal face pack'],
    feed: { material: [], pattern: [], product_detail: ['formulation', 'skinType', 'shade'] },
  },

  electronics: {
    key: 'electronics',
    label: 'Electronics & accessories',
    productTypes: ['Earbuds', 'Headphones', 'Speaker', 'Power Bank', 'Charger', 'Cable', 'Mouse', 'Keyboard', 'Smartwatch', 'Phone Case', 'Screen Guard', 'Trimmer', 'Mixer Grinder', 'Kettle', 'Iron', 'Fan', 'Bulb', 'Tripod'],
    attributes: [
      text('model', 'Model / variant', { max: 60 }),
      text('compatibility', 'Compatible with', { hint: 'Android & iOS · Type-C phones', max: 120 }),
      text('capacity', 'Capacity / power', { hint: '20000 mAh · 35W · 500W', max: 60 }),
      sel('connectivity', 'Connectivity', ['Bluetooth 5.3', 'Bluetooth 5.0', 'Wired', 'USB-C', 'Micro USB', 'Wi-Fi', '2.4 GHz wireless', 'Not applicable']),
      text('battery', 'Battery / playtime', { hint: '40 h with case · 10 h per charge', max: 80 }),
      text('inTheBox', 'What is in the box', { hint: 'Earbuds, case, Type-C cable, manual', max: 120, required: true }),
      text('warranty', 'Warranty', { hint: '1 year manufacturer warranty', max: 80, required: true }),
      text('bisNumber', 'BIS registration (R-number)', { hint: 'As printed on the pack / device, for CRS categories', max: 40 }),
    ],
    title: ['$brand', '$productType', 'capacity', 'connectivity', 'battery', '$color'],
    bullets: ['what it is and the headline spec', 'compatibility', 'battery / power / capacity', 'what is in the box', 'warranty and support'],
    legal: ['manufacturer', 'countryOfOrigin', 'netQuantity', 'warranty'],
    neverClaim: ['BIS certified unless the R-number is given', 'waterproof unless an IP rating is stated', 'original / OEM unless the seller is authorised'],
    seoSeeds: ['wireless earbuds with mic', 'power bank 20000mah fast charging', 'type c charger', 'bluetooth speaker', 'wireless mouse', 'smartwatch for men', 'phone back cover'],
    feed: { material: [], pattern: [], product_detail: ['capacity', 'connectivity', 'battery', 'warranty'] },
  },

  general: {
    key: 'general',
    label: 'Everything else',
    productTypes: [],
    attributes: [
      text('material', 'Material', { max: 80 }),
      text('dimensions', 'Size / dimensions', { max: 80 }),
      text('setContents', 'What is in the pack', { max: 80 }),
      multi('occasion', 'Occasion / use', OCCASION),
      sel('idealFor', 'Ideal for', IDEAL_FOR),
      text('careInstructions', 'Care', { max: 200 }),
    ],
    title: ['material', '$color', '$productType', 'setContents'],
    bullets: ['what it is', 'material and make', 'size', 'use / occasion', 'care'],
    legal: ['manufacturer', 'countryOfOrigin', 'netQuantity'],
    neverClaim: [],
    seoSeeds: [],
    feed: { material: ['material'], pattern: [], product_detail: ['dimensions'] },
  },
};

/** Top-level category name → template key. Anything not named here is `general`. */
const BY_TOP_CATEGORY = {
  Jewellery: 'jewellery',
  "Women's Fashion": 'apparel',
  "Men's Fashion": 'apparel',
  'Kids & Baby': 'apparel',
  'Beauty & Personal Care': 'beauty',
  Electronics: 'electronics',
};
/** Sub-categories that pick a different template than their parent would. */
const BY_SUBCATEGORY = {
  'Bedsheets & Bedding': 'home-textiles',
  'Curtains & Cushions': 'home-textiles',
  'Bath Linen & Accessories': 'home-textiles',
  'Block Prints & Textiles': 'home-textiles',
  'Kitchen Appliances': 'electronics',
  'Baby Care & Feeding': 'general',
  'Diapers & Wipes': 'general',
  'School Essentials': 'general',
};

/**
 * The template for a category document ({ name, parent? } - parent populated
 * or plain). Sub-category exceptions first, then the top level, else general.
 */
const templateFor = (category) => {
  if (!category) return TEMPLATES.general;
  const own = category.name || '';
  const parentName = category.parent?.name || category.parentCategory?.name || '';
  const key = BY_SUBCATEGORY[own] || BY_TOP_CATEGORY[parentName] || BY_TOP_CATEGORY[own] || 'general';
  return TEMPLATES[key] || TEMPLATES.general;
};

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const snap = (options, value) => {
  const v = norm(value);
  if (!v || v === 'unknown' || v === 'other' || v === 'not applicable' && !options.includes('Not applicable')) return null;
  return options.find((o) => norm(o) === v) || options.find((o) => norm(o).startsWith(v) || v.startsWith(norm(o))) || null;
};

/** Whatever the form or the model sent → only this template's keys, options snapped, text capped. */
const cleanAttributes = (template, raw) => {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const a of template.attributes) {
    const v = raw[a.key];
    if (v === undefined || v === null || v === '') continue;
    if (a.type === 'select') {
      const hit = snap(a.options, Array.isArray(v) ? v[0] : v);
      if (hit) out[a.key] = hit;
    } else if (a.type === 'multi') {
      const list = (Array.isArray(v) ? v : String(v).split(/[,/]/)).map((x) => snap(a.options, x)).filter(Boolean);
      if (list.length) out[a.key] = [...new Set(list)].slice(0, 6);
    } else {
      const s = String(v).trim().slice(0, a.max || 120);
      if (s) out[a.key] = s;
    }
  }
  return out;
};

/** Required attributes this listing still lacks. */
const missingRequired = (template, attributes = {}) =>
  template.attributes.filter((a) => a.required && !(attributes[a.key] && String(attributes[a.key]).length)).map((a) => a.key);

/**
 * The marketplace title: facts left to right, most-searched first, no
 * adjectives, no word twice (Amazon 2025), <= 150 chars. `$keys` come from the
 * product (color, productType, brand, idealFor, netQuantity), plain keys from
 * the attributes. A "Bedsheet" whose set line already starts with "1 Bedsheet"
 * is not said twice.
 */
const titleFrom = (template, attributes = {}, product = {}) => {
  const seen = new Map();
  const parts = [];
  for (const k of template.title) {
    const raw = k.startsWith('$') ? product[k.slice(1)] : attributes[k];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) continue;
    let s = String(value).trim();
    if (k === 'setContents') s = s.replace(/^\s*1\s+/, '');
    // A word is said at most twice across the whole title.
    const words = s.split(/\s+/).filter((w) => {
      const key = w.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!key) return true;
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      return n <= 2;
    });
    if (words.length) parts.push(words.join(' '));
  }
  // The set line starts with the product type when it names it ("Bedsheet with 2 Pillow Covers").
  const title = parts.join(' ').replace(/\b(\w+)\s+\1\b/gi, '$1').replace(/\s+/g, ' ').trim();
  return title.slice(0, 150);
};

module.exports = { TEMPLATES, BY_TOP_CATEGORY, BY_SUBCATEGORY, templateFor, cleanAttributes, missingRequired, titleFrom };
