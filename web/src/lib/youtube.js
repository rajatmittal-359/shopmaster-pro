/** Mirror of backend/utils/youtube.js: the 11-char id from any YouTube link, or null. */
const ID = /^[A-Za-z0-9_-]{11}$/;

export const youtubeId = (input) => {
  if (typeof input !== 'string' || !input.trim()) return null;
  const text = input.trim();
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
