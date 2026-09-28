/**
 * The picture a product travels as.
 *
 * WHY AN IMAGE AND NOT A LINK CARD (28 Sep 2026)
 *   The link card only exists in a WhatsApp or Facebook CHAT. On WhatsApp
 *   Status, on an Instagram post and in a reel, a link is not clickable at
 *   all and no preview is ever drawn - those surfaces carry a picture and a
 *   caption, nothing else. And even in a chat the card is not guaranteed:
 *   the person receiving it can switch previews off.
 *
 *   So the product's identity has to be the PICTURE, with the words printed
 *   into it. Then it works everywhere, and the card is a bonus rather than
 *   the whole plan. That is also why the short link exists - printed on an
 *   image it cannot be tapped, so it has to be short enough to read once and
 *   type.
 *
 * HOW, WITHOUT A NEW SERVICE
 *   Cloudinary already holds every photograph and will compose text over it
 *   on the fly. No render step, no storage, no bill: the URL IS the
 *   instruction, and Cloudinary caches the result.
 *
 *   `c_pad,b_white,g_north` puts the photograph at the top and pads below
 *   rather than cropping - a necklace shot on white loses nothing and the
 *   white band becomes the place the words go.
 */

/** Cloudinary reads `/` and `,` as its own syntax; text must hide them twice. */
const esc = (s) =>
  // The slash and comma are turned into their escapes FIRST, then the whole
  // string is encoded - so `%2F` becomes `%252F`, which is what Cloudinary
  // needs to read them as characters rather than as its own punctuation.
  encodeURIComponent(String(s || '').replace(/\//g, '%2F').replace(/,/g, '%2C'));

const PINK = 'C2186F'; // the Jaipur pink from DESIGN.md - the only colour here
const INK = '1a1a1a';
const MUTED = '5a5a5a';

/**
 * A long title wraps to three lines and starts eating the photograph, so it
 * is cut at the last whole word that fits. Two lines is the design.
 */
const fit = (name, max = 58) => {
  const s = String(name || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 20 ? cut.lastIndexOf(' ') : max)}…`;
};

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/**
 * @param {string} src   a Cloudinary URL from the product
 * @param {object} p     { name, price, shopName, shopPath }
 * @param {object} size  the shape and where the words sit in it
 * @returns {string|null} null when the photo is not ours to transform
 */
const compose = (src, p, size) => {
  const marker = '/image/upload/';
  const at = String(src || '').indexOf(marker);
  if (at < 0) return null;

  const head = src.slice(0, at + marker.length);
  const tail = src.slice(at + marker.length);
  const link = `${p.shopName} · shopmasterpro.in${p.shopPath}`;

  const layers = [
    /*
     * TWO STEPS, NOT ONE. Padding straight to 9:16 leaves the necklace
     * small and marooned in the middle of a white page - it looked like a
     * mistake. So the photograph is first fitted to a block close to its
     * own shape, and only then is the canvas extended downwards; the white
     * that appears is all at the bottom, where the words go.
     */
    `w_${size.w},h_${size.photo},c_pad,b_white`,
    `w_${size.w},h_${size.h},c_lpad,b_white,g_north`,
    `l_text:Arial_${size.title}_bold_center:${esc(fit(p.name))},co_rgb:${INK},w_${Math.round(size.w * 0.85)},c_fit,g_south,y_${size.gap.title}`,
    `l_text:Arial_${size.price}_bold:${esc(rupees(p.price))},co_rgb:${PINK},g_south,y_${size.gap.price}`,
    `l_text:Arial_${size.foot}:${esc(link)},co_rgb:${MUTED},g_south,y_${size.gap.foot}`,
    'f_jpg,q_auto',
  ];
  return `${head}${layers.join('/')}/${tail}`;
};

/*
 * Two shapes, because these are the two that travel AS PICTURES:
 *   post  1080x1350 4:5  - the tallest an Instagram feed post may be, and
 *                          what a forwarded WhatsApp photo should be
 *   story 1080x1920 9:16 - WhatsApp Status, Instagram story, reel cover
 *
 * There is no third for the chat card: that one carries its own title and
 * price from the meta tags, so printing them into the picture as well would
 * say everything twice. `ogImage` below makes that one, wordless.
 */
const SIZES = {
  post: { w: 1080, h: 1350, photo: 1000, title: 54, price: 104, foot: 36, gap: { title: 250, price: 130, foot: 62 } },
  story: { w: 1080, h: 1920, photo: 1400, title: 60, price: 120, foot: 40, gap: { title: 330, price: 170, foot: 90 } },
};

export const shareImages = (src, product) => ({
  post: compose(src, product, SIZES.post),
  story: compose(src, product, SIZES.story),
});

export const ogImage = (src, alt) => {
  const marker = '/image/upload/';
  const at = String(src || '').indexOf(marker);
  if (at < 0) return { url: src, alt };
  return {
    url: `${src.slice(0, at + marker.length)}w_1200,h_630,c_pad,b_white,f_jpg,q_auto/${src.slice(at + marker.length)}`,
    width: 1200,
    height: 630,
    type: 'image/jpeg',
    alt,
  };
};

/*
 * THE WORDS, PER SURFACE (28 Sep 2026)
 *   A caption is not one thing either. Instagram rewards hashtags and
 *   refuses links; WhatsApp does the opposite - a hashtag there is noise and
 *   the link is the whole point. Writing one caption for both would be
 *   wrong in two places at once.
 */
export const captions = ({ name, price, shopName, shopPath, url, categoryName }) => {
  const rs = rupees(price);
  /*
   * The tags come from the CATEGORY and the shop, never from a list written
   * here. This marketplace sells anything - CLAUDE.md is explicit that
   * nothing in the frame may name a category - and a hard-coded #kundan
   * would follow a power bank onto Instagram.
   */
  const tag = (t) => `#${String(t).replace(/[^a-zA-Z0-9]/g, '')}`;
  const tags = [tag(shopName), '#jaipur', ...String(categoryName || '').split(/[&,/]| and /).map((w) => tag(w.trim())), '#madeinindia', '#onlineshopping']
    .filter((t) => t.length > 3)
    .filter((t, i, a) => a.indexOf(t) === i)
    .slice(0, 8)
    .join(' ');

  return {
    whatsapp: `${name}
${rs}

${url}`,
    status: `${name} · ${rs}
shopmasterpro.in${shopPath}`,
    instagram:
      `${name}
${rs}

` +
      `Order: shopmasterpro.in${shopPath} (link in bio)
` +
      `Delivered across India · 7-day returns

${tags}`,
  };
};
