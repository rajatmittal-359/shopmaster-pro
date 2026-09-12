/**
 * A YouTube link as the product video.
 *
 * WHY
 *   The upload slot takes a 7 MB clip because Cloudinary storage is paid and
 *   a marketplace of sellers would fill it. A seller who already put a
 *   two-minute demo on YouTube (or WhatsApp-forwarded a Short) should just
 *   paste the link: nothing to store, no size limit, and YouTube's player
 *   handles every phone. Amazon and Flipkart host their own; Etsy and
 *   Shopify stores embed YouTube - for our size the second is right.
 *
 * WHAT IS ACCEPTED
 *   watch?v=, youtu.be/, shorts/, embed/, live/ - anything with an 11-char
 *   video id. Playlists, channels and non-YouTube hosts are refused (null),
 *   and the caller tells the seller so.
 *
 * No API key: the thumbnail comes from i.ytimg.com and the player from the
 * nocookie embed domain, both free and unlimited.
 */
const ID = /^[A-Za-z0-9_-]{11}$/;

const youtubeId = (input) => {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text) return null;
  let url;
  try {
    url = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
      if (m) id = m[2];
    }
  }
  return id && ID.test(id) ? id : null;
};

/** The stored shape for a YouTube video - same fields as an upload, plus the id. */
const youtubeVideo = (id) => ({
  url: `https://www.youtube.com/watch?v=${id}`,
  publicId: null,
  poster: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  duration: null,
  youtubeId: id,
});

const embedUrl = (id) => `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`;

module.exports = { youtubeId, youtubeVideo, embedUrl };
