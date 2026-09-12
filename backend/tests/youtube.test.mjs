/** A YouTube link as the product video: every link shape people paste, and the ones we refuse. */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { youtubeId, youtubeVideo } = require('../utils/youtube');

describe('youtubeId', () => {
  it('reads the id from watch, short, shorts, embed, live and mobile links', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ&t=12s',
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'youtu.be/dQw4w9WgXcQ',
    ]) expect(youtubeId(u)).toBe('dQw4w9WgXcQ');
  });
  it('refuses playlists, channels, other hosts and junk', () => {
    for (const u of ['https://www.youtube.com/playlist?list=PL123', 'https://www.youtube.com/@charmingjewels', 'https://vimeo.com/123', 'not a link', '', null]) expect(youtubeId(u)).toBe(null);
  });
  it('stores the same shape as an upload, plus the id and a real thumbnail', () => {
    expect(youtubeVideo('dQw4w9WgXcQ')).toEqual({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      publicId: null,
      poster: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      duration: null,
      youtubeId: 'dQw4w9WgXcQ',
    });
  });
});
