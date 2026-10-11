/*
 * THE PICTURE WHATSAPP ACTUALLY SHOWS (28 Sep 2026, moved here 12 Oct 2026)
 *
 *   Rajat shared a necklace on WhatsApp and got a card with the title, the
 *   description and no photograph - "image nahi dikhegi to koi kaise lega".
 *   The tag was there and the file was fine: 200, JPEG, 147 KB, 1200x800,
 *   1.3 s. What was missing was everything AROUND it.
 *
 *   WhatsApp will not wait to download and measure an image it has not been
 *   told the size of; without og:image:width and height it falls back to the
 *   small card with a favicon, which is exactly what he saw. And 1200x800 is
 *   3:2, while the large card is cut for 1.91:1 - so even when it renders,
 *   the sides of a necklace get cropped away.
 *
 *   So: declare the dimensions, and ask Cloudinary for the shape the card
 *   wants. `c_pad,b_white` adds white margins rather than cropping - a
 *   necklace photographed on white loses nothing and stays whole - and
 *   `q_auto,f_jpg` brings 147 KB down to a size that arrives before the
 *   fetcher gives up.
 *
 *   Anything that is not a Cloudinary URL is passed through untouched, with
 *   no dimensions claimed, because a size we have not verified is worse than
 *   none.
 *
 * WHY IT LIVES IN ITS OWN FILE
 *   The shop page needs the same card as the product page, for the same
 *   reason: it is the link that goes in an Instagram bio, where a caption URL
 *   is never clickable and the bio Links field is one of the only three
 *   places Instagram will take a link at all. Two callers, one rule - if the
 *   transform ever changes, a page cannot be left behind holding the old one.
 */
export const OG_W = 1200;
export const OG_H = 630;

/**
 * @param {string} url  a product photograph, Cloudinary or otherwise
 * @param {string} alt  what the picture is of
 * @returns {{url: string, alt: string, width?: number, height?: number, type?: string}}
 */
export const shareImage = (url, alt) => {
  const marker = '/image/upload/';
  const at = String(url || '').indexOf(marker);
  if (at < 0) return { url, alt };
  const transform = `w_${OG_W},h_${OG_H},c_pad,b_white,f_jpg,q_auto`;
  return {
    url: `${url.slice(0, at + marker.length)}${transform}/${url.slice(at + marker.length)}`,
    width: OG_W,
    height: OG_H,
    type: 'image/jpeg',
    alt,
  };
};
