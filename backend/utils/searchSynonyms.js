/**
 * What people type, in the words they use - Hinglish and Hindi to the English
 * the listings are written in (plan 2.21).
 *
 * Meesho's lesson: ~60% of its orders come from tier-4+ towns and 70% of
 * those buyers prefer their own language; conversion rose when search
 * understood it. Ours is a small table, not a model: "jhumka" IS the word
 * for the thing, and a table answers in a millisecond. Anything the table
 * does not know falls through to the vector search (utils/productVectors),
 * which understands "chhoti ladki ke liye gift" without a table at all.
 *
 * Both directions are built: a query for "earrings" also matches a listing
 * tagged "jhumka". Add a line; nothing else to touch.
 */
const GROUPS = [
  ['jhumka', 'jhumki', 'jhumke', 'झुमका', 'झुमके', 'earring', 'earrings', 'bali', 'baliyan', 'बाली', 'kaan ki bali', 'tops', 'stud', 'studs'],
  ['kada', 'kade', 'कड़ा', 'kangan', 'कंगन', 'chudi', 'choodi', 'chudiyan', 'चूड़ी', 'चूड़ियाँ', 'bangle', 'bangles', 'bracelet'],
  ['payal', 'पायल', 'pajeb', 'anklet', 'anklets', 'ghungroo'],
  ['haar', 'हार', 'mala', 'माला', 'necklace', 'necklaces', 'chain', 'choker', 'set'],
  ['angoothi', 'anguthi', 'अंगूठी', 'ring', 'rings', 'chhalla'],
  ['nath', 'nathni', 'नथ', 'nose pin', 'nose ring', 'nosepin', 'naak ki nath'],
  ['tikka', 'maang tikka', 'mangtika', 'टीका', 'मांग टीका', 'matha patti', 'head jewellery'],
  ['mangalsutra', 'मंगलसूत्र', 'mangal sutra'],
  ['bindi', 'बिंदी'],
  ['kurti', 'kurta', 'कुर्ती', 'कुर्ता', 'kurtis', 'kurtas', 'tunic'],
  ['saree', 'sari', 'साड़ी', 'sarees', 'saris'],
  ['lehenga', 'लहंगा', 'lehnga', 'ghagra', 'chaniya choli'],
  ['dupatta', 'chunni', 'दुपट्टा', 'चुन्नी', 'stole', 'scarf'],
  ['salwar', 'suit', 'सलवार', 'सूट', 'churidar', 'palazzo', 'anarkali'],
  ['jutti', 'mojari', 'जूती', 'मोजड़ी', 'ethnic footwear', 'kolhapuri'],
  ['chappal', 'चप्पल', 'slipper', 'slippers', 'sandal', 'sandals', 'flip flop'],
  ['joota', 'joote', 'जूता', 'जूते', 'shoe', 'shoes', 'sneaker', 'sneakers'],
  ['ghadi', 'घड़ी', 'watch', 'watches'],
  ['chashma', 'चश्मा', 'sunglasses', 'glasses', 'goggles'],
  ['bag', 'thaila', 'थैला', 'purse', 'handbag', 'batua', 'बटुआ', 'wallet', 'clutch'],
  ['sona', 'सोना', 'gold', 'golden', 'sunehra', 'gold plated', 'gold toned'],
  ['chandi', 'चाँदी', 'चांदी', 'silver', 'oxidised', 'oxidized', 'german silver', 'silver toned'],
  ['moti', 'मोती', 'pearl', 'pearls'],
  ['patthar', 'पत्थर', 'stone', 'stones', 'nag', 'kundan', 'कुंदन', 'polki', 'ad stone', 'american diamond', 'cz'],
  ['meenakari', 'मीनाकारी', 'minakari', 'enamel'],
  ['lal', 'लाल', 'red', 'maroon'],
  ['hara', 'हरा', 'green', 'emerald'],
  ['neela', 'नीला', 'blue', 'navy'],
  ['peela', 'पीला', 'yellow'],
  ['kala', 'काला', 'black'],
  ['safed', 'सफ़ेद', 'सफेद', 'white'],
  ['gulabi', 'गुलाबी', 'pink', 'rose'],
  ['ladki', 'ladkiyon', 'mahila', 'aurat', 'लड़की', 'महिला', 'औरत', 'women', 'woman', 'ladies', 'female', 'girls'],
  ['ladka', 'aadmi', 'purush', 'लड़का', 'आदमी', 'पुरुष', 'men', 'man', 'gents', 'male', 'boys'],
  ['bacha', 'bachcha', 'bachche', 'बच्चा', 'बच्चे', 'kids', 'kid', 'children', 'baby'],
  ['shaadi', 'शादी', 'wedding', 'bridal', 'dulhan', 'दुल्हन', 'bride'],
  ['tyohar', 'त्योहार', 'festive', 'festival', 'diwali', 'दिवाली', 'karwa chauth', 'teej', 'rakhi', 'राखी'],
  ['gift', 'tohfa', 'तोहफ़ा', 'uphaar', 'उपहार', 'present'],
  ['sasta', 'सस्ता', 'cheap', 'budget', 'under'],
];

const INDEX = new Map();
for (const g of GROUPS) for (const w of g) INDEX.set(w.toLowerCase(), g);

/**
 * "lal jhumka ladki ke liye" → "lal jhumka ladki ke liye red earring earrings women ladies…"
 * The original words stay first so an exact listing still ranks first.
 */
const expandQuery = (q) => {
  const raw = String(q || '').trim();
  if (!raw) return raw;
  const lower = raw.toLowerCase();
  const extra = new Set();
  // two-word phrases first (maang tikka, nose pin), then single words
  const words = lower.split(/\s+/);
  for (let i = 0; i < words.length; i += 1) {
    const two = i + 1 < words.length ? `${words[i]} ${words[i + 1]}` : null;
    for (const key of [two, words[i]]) {
      const g = key && INDEX.get(key);
      if (!g) continue;
      // English words first - that is what the listings are written in; the
      // Hinglish/Hindi variants only help when a seller tagged one.
      const ranked = [...g.filter((w) => /^[a-z ]+$/.test(w)), ...g.filter((w) => !/^[a-z ]+$/.test(w))];
      for (const w of ranked.slice(0, 8)) if (!lower.includes(w)) extra.add(w);
    }
  }
  return extra.size ? `${raw} ${[...extra].join(' ')}` : raw;
};

module.exports = { expandQuery, GROUPS };
