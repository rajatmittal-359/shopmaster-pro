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
export default function ShareButtons({ url, name, price }) {
  const [copied, setCopied] = useState(false);
  const text = `${name}${price ? ` - ₹${Number(price).toLocaleString('en-IN')}` : ''} on ShopMaster Pro`;
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;

  const share = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: name, text, url });
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
