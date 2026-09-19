/**
 * सीखें - the lessons, as data, so the page and the audio script read one
 * source (plan 2.27). Each lesson: title, when, steps [[step, note]], href,
 * cta. Hindi first for the shopkeeper; English under the toggle.
 * `speech(lesson)` is the text bulbul reads aloud - the same words, with the
 * button names spoken plainly.
 */
export const LESSONS = {
  hi: [
    {
      title: 'ऑर्डर आया - अब क्या करना है',
      when: 'जब फ़ोन पर "नया ऑर्डर" वाला मेल आए',
      steps: [
        ['मेल में नीला बटन "ऑर्डर खोलें" दबाएँ।', 'सीधे उस ऑर्डर पर पहुँचेंगे। या पैनल में Orders → "To pack"।'],
        ['देखें क्या और कितना भेजना है, ग्राहक का नाम और शहर।', 'फोटो के साथ लिखा होगा।'],
        ['सामान पैक करें - पहले वापसी टैग बाँधें और फोटो लें (अगला पाठ), फिर मज़बूत डिब्बा, अंदर बबल रैप, ऊपर टेप।', 'ज्वेलरी हो तो छोटी थैली में, फिर डिब्बे में।'],
        ['ऑर्डर पेज पर "Book courier and ship" दबाएँ।', 'कूरियर वाला 1-2 दिन में आपके पते से उठा लेगा। लेबल वही लाएगा - आपको लेबल प्रिंट नहीं करना।'],
        ['बस। ग्राहक को खुद मैसेज चला जाएगा।', 'ऑर्डर "Shipped" में चला जाएगा। 2 दिन के अंदर भेजना ज़रूरी है।'],
      ],
      href: '/seller/orders?tab=pack',
      cta: 'ऑर्डर देखें',
    },
    {
      title: 'पैक करने से पहले - टैग और फोटो',
      when: 'हर ऑर्डर में, कूरियर बुक करने से पहले - 2 मिनट',
      steps: [
        ['ऑर्डर पेज पर "वापसी टैग प्रिंट करें" दबाएँ - हर पीस के लिए एक छोटा कार्ड निकलेगा।', 'कार्ड पर आपकी दुकान, ऑर्डर नंबर और नियम लिखा है - हिंदी और English में।'],
        ['कार्ड काटें और सील (या धागे) से पीस पर बाँधें - ऐसी जगह जहाँ पहनने पर दिखे।', 'सील खोले बिना पीस पहना नहीं जा सकता - यही इसका मतलब है।'],
        ['टैग दिखाते हुए पैक किए सामान की एक फोटो लें और "Save pack proof" दबाएँ।', 'यही फोटो तय करती है - "टूटा आया", "गलत आया", "डिब्बा खाली" - सब में।'],
        ['अब "Book courier and ship"।', ''],
        ['अगर पीस वापस आए: टैग लगा और सील सही → पैसा लौटा दें। टैग कटा या पीस इस्तेमाल हुआ → "Refuse it", फोटो के साथ।', 'बिना टैग की वापसी मन बदलने वाली वापसी नहीं है - नियम आपके साथ है।'],
      ],
      href: '/seller/orders?tab=pack',
      cta: 'पैक करने वाले ऑर्डर',
    },
    {
      title: 'नया प्रोडक्ट डालना - फोटो से',
      when: 'जब कोई नई चीज़ बेचनी हो',
      steps: [
        ['Products → "Add a product" दबाएँ।', 'फ़ोन से भी हो जाता है।'],
        ['सबसे पहले फोटो लें - दिन की रोशनी में, सादे कपड़े या कागज़ पर।', 'एक पास से, एक पहनकर, एक पूरे सेट की। 3 फोटो अच्छे हैं।'],
        ['"Write it for me" दबाएँ - नाम, विवरण, खोज के शब्द AI लिख देगा।', 'हिंदी में भी बोल सकते हैं - "लाल कुंदन झुमका, शादी के लिए"।'],
        ['दाम, MRP और कितने पीस हैं - यह आप भरें।', 'MRP वही जो डिब्बे पर छपी है।'],
        ['कैटेगरी चुनें (टाइप करके), फिर "Save product"।', 'ऊपर एक स्कोर दिखेगा - 80 से ऊपर हो तो Google पर अच्छा दिखेगा।'],
      ],
      href: '/seller/products/new',
      cta: 'प्रोडक्ट जोड़ें',
    },
    {
      title: 'ग्राहक सामान वापस करना चाहता है',
      when: 'जब "वापसी" वाला मेल आए',
      steps: [
        ['घबराएँ नहीं - 7 दिन में वापसी ग्राहक का हक़ है, हर बड़ी साइट पर।', 'मेल में कारण लिखा होगा।'],
        ['अभी कुछ नहीं करना। पिकअप अपने आप बुक होता है, राइडर ग्राहक से ले आएगा।', ''],
        ['सामान आपके पास पहुँचे तो खोलकर देखें - वही है, सही हालत में?', ''],
        ['ऑर्डर पेज पर "Received" दबाएँ - पैसा ग्राहक को अपने आप लौट जाएगा।', 'अगर ग्राहक ने बदली माँगी है तो नया पीस भेजें - वह मुफ़्त जाता है।'],
        ['अगर सामान गलत या इस्तेमाल किया हुआ आए, तो "Refuse it" - फोटो के साथ। एडमिन देखेगा।', ''],
      ],
      href: '/seller/issues',
      cta: 'वापसी देखें',
    },
    {
      title: 'पैसा कब और कैसे आता है',
      when: 'हर डिलीवरी के 7 दिन बाद',
      steps: [
        ['ग्राहक को सामान मिला → 7 दिन रुकता है (वापसी का समय) → फिर आपके बैंक में।', 'सीधे उसी खाते में जो Payments में डाला है।'],
        ['Payments पेज पर हर रुपये का हिसाब है - कौन सा ऑर्डर, कितना, कब।', ''],
        ['कमीशन आम तौर पर 8% है; एडमिन किसी दुकान के लिए अलग दर रख सकता है - आपकी दर Settings में लिखी है।', ''],
        ['अगर कोई कटौती हो (जैसे ऑर्डर रद्द करने का ₹50), तो उसी लाइन में लिखा होगा।', 'महीने में 2 रद्द मुफ़्त हैं।'],
      ],
      href: '/seller/payments',
      cta: 'पेमेंट देखें',
    },
    {
      title: 'रिव्यू माँगना और जवाब देना',
      when: 'हर डिलीवरी के बाद, 1 मिनट',
      steps: [
        ['सामान पहुँचने के 2-3 दिन बाद ग्राहक को WhatsApp करें।', '"Get found on Google" पेज पर बना-बनाया मैसेज है - कॉपी करके भेजें।'],
        ['रिव्यू आए तो दो लाइन का जवाब दें - नाम लेकर, धन्यवाद।', 'अच्छे को भी, बुरे को भी। पढ़ने वाले जवाब देखते हैं।'],
        ['10 रिव्यू होने पर Google में दुकान के नीचे तारे दिखने लगते हैं।', 'यही सबसे बड़ा भरोसा है नए ग्राहक के लिए।'],
      ],
      href: '/seller/grow',
      cta: 'मैसेज कॉपी करें',
    },
    {
      title: 'Google पर दिखना - आपके हाथ में क्या है',
      when: 'हर नया प्रोडक्ट डालते समय, और महीने में एक बार पुराने के लिए',
      steps: [
        ['टाइटल वैसे लिखें जैसे लोग खोजते हैं: चीज़ + धातु/रंग + किसके लिए।', 'जैसे "ऑक्सिडाइज़्ड सिल्वर झुमका, महिलाओं के लिए" - सिर्फ़ "झुमका" नहीं। फ़ॉर्म में स्कोर खुद बताएगा।'],
        ['"Suggest search words" दबाएँ और G / S वाले शब्द जोड़ें।', 'G = Google पर लोगों ने यही टाइप किया, S = ShopMaster पर। नंबर बताता है कितनी बार। ये अंदाज़ा नहीं, असली खोजें हैं।'],
        ['"Questions shoppers ask" में 2-3 जवाब रखें - "Draft 3 with AI" से शुरू करें, फिर अपने शब्दों में ठीक करें।', 'Google के AI जवाब और ChatGPT जैसे असिस्टेंट उन्हीं पेजों को दोहराते हैं जिनमें साफ़ जवाब लिखे हों।'],
        ['तीन फोटो, रंग, साइज़, वज़न - हर खाली खाना भरें। स्कोर 80 से ऊपर रखें।', 'Google Shopping में मुफ़्त दिखने के लिए यही सब चाहिए; कमी हो तो प्रोडक्ट छपता ही नहीं।'],
        ['"Near me" के लिए: Settings में शहर दिखाएँ, About में अपना शहर लिखें, Business Profile जोड़ें।', 'पास वाली दुकान दूर वाली बड़ी दुकान से ऊपर आती है - बस Google को पता होना चाहिए आप कहाँ हैं।'],
        ['Grow पेज पर "How Google reads your shop" हफ़्ते में एक बार देखें।', 'जो प्रोडक्ट 80 से नीचे हैं वहीं दिखेंगे, पहला सुधार लिखा होगा - एक-एक करके ठीक करें।'],
      ],
      href: '/seller/grow',
      cta: 'Grow खोलें',
    },
  ],
  en: [
    {
      title: 'An order came in - what to do',
      when: 'When the "New order" mail arrives on your phone',
      steps: [
        ['Tap the blue "Open the order" button in the mail.', 'Or Orders → "To pack" in the panel.'],
        ['See what to send, how many, the customer’s name and city.', ''],
        ['Pack it - return tag tied on and the photo taken first (next lesson), then a firm box, bubble wrap inside, tape on top.', 'Jewellery in a small pouch first, then the box.'],
        ['On the order page press "Book courier and ship".', 'The courier collects from your address in 1-2 days and brings the label - you do not print the label.'],
        ['Done. The customer is messaged automatically.', 'Dispatch within 2 working days.'],
      ],
      href: '/seller/orders?tab=pack',
      cta: 'See orders',
    },
    {
      title: 'Before you pack - the tag and the photo',
      when: 'Every order, before booking the courier - 2 minutes',
      steps: [
        ['On the order page press "Print return tags" - one small card per piece.', 'The card carries your shop, the order number and the rule, in Hindi and English.'],
        ['Cut the cards out and tie one on each piece with the seal (or a thread) - where it would show if worn.', 'The piece cannot be worn without breaking the seal. That is the whole point.'],
        ['Take one photo of the packed piece with the tag showing and press "Save pack proof".', 'This photo decides "arrived damaged", "wrong item", "empty box" - all of them.'],
        ['Now "Book courier and ship".', ''],
        ['If it comes back: tag on, seal unbroken → refund. Tag cut or piece used → "Refuse it", with photos.', 'A return without the tag is not a change-of-mind return - the rule is on your side.'],
      ],
      href: '/seller/orders?tab=pack',
      cta: 'Orders to pack',
    },
    {
      title: 'Adding a product - from a photo',
      when: 'When there is something new to sell',
      steps: [
        ['Products → "Add a product".', 'Works on a phone.'],
        ['Photos first - daylight, plain cloth or paper behind.', 'One close, one worn, one of the full set. Three is good.'],
        ['Press "Write it for me" - the AI writes the name, description and search words.', 'You can speak Hindi to it: "laal kundan jhumka, shaadi ke liye".'],
        ['Price, MRP and how many you have - you fill these.', 'MRP as printed on the pack.'],
        ['Pick the category (type to search), then "Save product".', 'A score shows at the top - above 80 does well on Google.'],
      ],
      href: '/seller/products/new',
      cta: 'Add a product',
    },
    {
      title: 'A customer wants to return something',
      when: 'When the "Return requested" mail arrives',
      steps: [
        ['Do not worry - a 7-day return is the customer’s right on every big site.', 'The reason is in the mail.'],
        ['Nothing to do yet. The pickup books itself; the rider collects from the customer.', ''],
        ['When it reaches you, open it - same item, good condition?', ''],
        ['Press "Received" on the order - the refund goes back automatically.', 'If they asked for an exchange, send the new piece - it ships free.'],
        ['Wrong or used item? "Refuse it", with photos. An admin looks.', ''],
      ],
      href: '/seller/issues',
      cta: 'See returns',
    },
    {
      title: 'When and how the money comes',
      when: '7 days after each delivery',
      steps: [
        ['Customer receives it → 7 days pass (the return window) → your bank.', 'Straight to the account in Payments.'],
        ['Payments lists every rupee - which order, how much, when.', ''],
        ['Commission is 8% by default; the admin can set a different rate for a shop - yours is under Settings.', ''],
        ['Any deduction (a ₹50 cancel charge) is on the same line.', 'Two cancels a month are free.'],
      ],
      href: '/seller/payments',
      cta: 'See payments',
    },
    {
      title: 'Asking for reviews, and replying',
      when: 'After every delivery, one minute',
      steps: [
        ['2-3 days after delivery, WhatsApp the customer.', 'A ready message is on "Get found on Google" - copy and send.'],
        ['When a review comes, reply in two lines - by name, with thanks.', 'Good and bad alike. Readers look at replies.'],
        ['At ten reviews, stars appear under the shop in Google.', 'The biggest trust signal a new customer sees.'],
      ],
      href: '/seller/grow',
      cta: 'Copy the message',
    },
    {
      title: 'Being found on Google - the part that is yours',
      when: 'Every time you add a product, and once a month for the old ones',
      steps: [
        ['Write the title the way people search: the thing + material or colour + who it is for.', '"Oxidised silver jhumka earrings for women", not "Jhumka". The score in the form tells you.'],
        ['Press "Suggest search words" and add the G and S ones.', 'G = typed on Google by real people, S = typed in ShopMaster\'s own search. The number is how many times. Not guesses - searches.'],
        ['Keep 2-3 answers under "Questions shoppers ask" - start with "Draft 3 with AI", then fix them in your words.', 'Google\'s AI answers and assistants like ChatGPT repeat pages that answer plainly.'],
        ['Three photos, colour, size, weight - fill every box. Keep the score at 80 or above.', 'That is what free Google Shopping listings need; a missing fact means the product is not shown at all.'],
        ['For "near me": show your city in Settings, name it in your About, link your Business Profile.', 'The shop nearby beats the big shop far away - Google only has to know where you are.'],
        ['Once a week, look at "How Google reads your shop" on Grow.', 'Products under 80 are listed there with their first fix - do them one at a time.'],
      ],
      href: '/seller/grow',
      cta: 'Open Grow',
    },
  ],
};

/** What the voice reads for one lesson: title, when, the steps in order. */
export const speech = (l) => [l.title + '.', l.when + '.', ...l.steps.map(([step, note], i) => `${i + 1}. ${step}${note ? ' ' + note : ''}`)].join(' ');
