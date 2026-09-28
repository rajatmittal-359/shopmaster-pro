'use client';

import { useState } from 'react';
import { Link2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Share a product (19 Sep 2026).
 *
 * WhatsApp is how a product travels between people in India - Meesho built a
 * whole business on resellers forwarding product cards. The link carries the
 * Open Graph card (photo, name, price) that this page already emits, so the
 * forwarded message shows the product, not a bare URL. `navigator.share` on a
 * phone opens the system sheet (WhatsApp, Instagram DM, anything installed);
 * on a laptop the WhatsApp link opens WhatsApp Web, and Copy link is always
 * there. No tracking parameters: the person is sharing, not being tracked.
 */
export default function ShareButtons({ url, name }) {
  const [copied, setCopied] = useState(false);
  /*
   * THE LINK GOES ALONE (28 Sep 2026)
   *
   *   This used to send "Name - ₹275 on ShopMaster Pro" and then the link,
   *   and WhatsApp drew no card at all - Rajat: "image nahi dikhegi to koi
   *   kaise lega". A message PREFILLED through wa.me?text=, or handed to
   *   navigator.share with both `text` and `url`, arrives as ordinary typed
   *   text, and WhatsApp only builds a preview for a link it sees pasted.
   *   Send the URL by itself and the card comes back - photograph, name,
   *   and now the price, which moved into og:description for this reason.
   *
   *   The words are not lost, they moved somewhere better: a card with the
   *   necklace in it does more than a line of text ever did.
   */
  const wa = `https://wa.me/?text=${encodeURIComponent(url)}`;

  const share = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        // No `text`: Android concatenates title, text and url into one typed
        // message, which is the thing that kills the preview.
        await navigator.share({ title: name, url });
        return;
      } catch {
        /* dismissed - fall through to the WhatsApp link */
      }
    }
    window.open(wa, '_blank', 'noopener');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Button type="button" variant="outline" size="sm" onClick={share} aria-label="Share on WhatsApp">
        <Share2 className="size-4" /> Share on WhatsApp
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={copy}>
        <Link2 className="size-4" /> {copied ? 'Copied' : 'Copy link'}
      </Button>
    </div>
  );
}
