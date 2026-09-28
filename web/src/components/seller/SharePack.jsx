'use client';

import { useState } from 'react';
import { Copy, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { shareImages, captions } from '@/lib/shareImage';

/**
 * Everything needed to put one product on WhatsApp, Status and Instagram.
 *
 * WHY THIS IS A PICTURE AND NOT A LINK (28 Sep 2026)
 *   Rajat shared a necklace and the card came through with no photograph:
 *   "image nahi dikhegi to koi kaise lega". That was fixed in the meta tags
 *   - but it only fixes a CHAT. On WhatsApp Status, on an Instagram post and
 *   in a reel, a link is not clickable and no preview is ever drawn; those
 *   surfaces carry a picture and a caption and nothing else. Even in a chat
 *   the recipient can switch previews off.
 *
 *   So the product's identity has to be the picture, with the words printed
 *   into it. That is what this hands over: two pictures and three captions,
 *   in the shapes each place actually wants.
 *
 *   The short link is printed on the image for the same reason. Nobody can
 *   tap a link inside a photograph, so it has to be short enough to read
 *   once and type - which is what /charming-jewels was always for.
 */
export default function SharePack({ product, shop }) {
  const t = useT();
  const [busy, setBusy] = useState('');

  const src = product?.images?.[0];
  if (!src || !shop) return null;

  const facts = {
    name: product.name,
    price: product.salePrice || product.price,
    shopName: shop.name,
    shopPath: shop.path,
    categoryName: product.category?.name,
    url: `https://www.shopmasterpro.in/products/${product.slug || product._id}`,
  };
  const images = shareImages(src, facts);
  const words = captions(facts);
  if (!images.post) return null;

  /*
   * Fetched as a blob before saving. `download` is ignored on a cross-origin
   * href, so a plain link would open Cloudinary in a tab instead of saving -
   * the same trap the WhatsApp catalogue photos hit on 27 Sep.
   */
  const save = async (key, filename) => {
    setBusy(key);
    try {
      const res = await fetch(images[key]);
      if (!res.ok) throw new Error('Could not build the picture');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.error(e.message || t('Could not save it'));
    } finally {
      setBusy('');
    }
  };

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('{what} copied', { what }));
    } catch {
      toast.error(t('Could not copy it'));
    }
  };

  const base = String(product.slug || product._id).slice(0, 40);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('The picture carries the name, the price and your shop link, so it works where a link does not - Status, Instagram, a reel.')}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { key: 'post', label: t('Instagram post'), note: t('Also good forwarded on WhatsApp'), ratio: 'aspect-[4/5]' },
          { key: 'story', label: t('Status / Story / Reel'), note: t('WhatsApp Status, Instagram story'), ratio: 'aspect-[9/16]' },
        ].map((s) => (
          <div key={s.key} className="rounded-lg border p-3">
            {/* The seller sees the real thing before they send it anywhere.
                eslint-disable-next-line @next/next/no-img-element */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[s.key]} alt="" className={`${s.ratio} w-full rounded-md border object-contain`} loading="lazy" />
            <div className="mt-2 text-sm font-medium">{s.label}</div>
            <div className="text-xs text-muted-foreground">{s.note}</div>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 w-full"
              disabled={busy === s.key}
              onClick={() => save(s.key, `${base}-${s.key}.jpg`)}
            >
              {busy === s.key ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {busy === s.key ? t('Saving…') : t('Save the picture')}
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {[
          { k: 'whatsapp', label: t('WhatsApp message'), hint: t('The link is on its own line so WhatsApp draws the card') },
          { k: 'status', label: t('Status caption'), hint: t('Short - a link here cannot be tapped, so it is typed') },
          { k: 'instagram', label: t('Instagram caption'), hint: t('With tags from this product’s own category') },
        ].map((c) => (
          <div key={c.k} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{c.label}</div>
                <div className="text-xs text-muted-foreground">{c.hint}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => copy(words[c.k], c.label)}>
                <Copy className="size-3.5" /> {t('Copy')}
              </Button>
            </div>
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{words[c.k]}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
