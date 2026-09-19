'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n';

/**
 * The shop's live products as WhatsApp-ready links (19 Sep 2026).
 *
 * WHY
 *   A Jaipur shop's real marketing channel is its own WhatsApp Business app:
 *   status updates, broadcast lists, a catalog with up to 500 items. Every
 *   item there should point at its ShopMaster page, so the customer orders
 *   here (payment, delivery, returns handled) instead of in a chat. This
 *   gives the seller the list in two shapes: a text they can paste into a
 *   status/broadcast or type into the app's catalog one by one, and the CSV
 *   Meta Commerce Manager imports (same columns as the Google feed).
 *
 * Client-side only - the rows are already on the page; nothing new is
 * fetched or stored. Built for every seller; the house shop simply goes
 * first.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.shopmasterpro.in';

const priceOf = (p) => (p.salePrice && (!p.saleEndsAt || new Date(p.saleEndsAt) > new Date()) ? p.salePrice : p.price);
const url = (p) => `${SITE}/products/${p.slug || p._id}`;
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ').trim()}"`;

export const asText = (products) => products.map((p) => `${p.name} - ₹${Number(priceOf(p)).toLocaleString('en-IN')}\n${url(p)}`).join('\n\n');

/** Meta Commerce Manager / Google Merchant column set - one file works for both. */
export const asCsv = (products, shopName = '') => {
  const head = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand'];
  const rows = products.map((p) => [p.sku || p._id, p.name, (p.description || '').replace(/<[^>]+>/g, ' ').slice(0, 5000), p.stock > 0 ? 'in stock' : 'out of stock', 'new', `${Number(priceOf(p)).toFixed(2)} INR`, url(p), p.images?.[0] || '', p.brand || shopName].map(csvCell));
  return [head.join(','), ...rows.map((r) => r.join(','))].join('\n');
};

export default function WhatsAppCatalog({ products, shopName }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const live = (products || []).filter((p) => p.isActive && !p.isDeleted && (p.images || []).length);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText(live));
      toast.success(t('{n} products copied - paste into WhatsApp', { n: live.length }));
    } catch {
      toast.error(t('Could not copy - select the text and copy it'));
    }
  };

  const download = () => {
    const blob = new Blob([asCsv(live, shopName)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'shopmaster-catalog.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} disabled={!live.length}>
        <MessageCircle className="size-4" /> {t('WhatsApp catalog')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('Your products, for WhatsApp')}</DialogTitle>
            <DialogDescription>{t('{n} live products with a photo. Each line is the name, the price and its page on ShopMaster - the customer orders here, you never handle payment in chat.', { n: live.length })}</DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>{t('WhatsApp Business app → Settings → Business tools → Catalog → Add item: photo, name, price, and paste the link as the item link.')}</li>
            <li>{t('Or post the text as a Status / send it to a broadcast list - WhatsApp shows the product card from the link on its own.')}</li>
            <li>{t('Meta Commerce Manager (Instagram Shop tags, ads later): Data sources → Add items → Upload file → the CSV below.')}</li>
          </ol>
          <textarea readOnly value={asText(live)} className="h-40 w-full rounded-md border bg-muted/40 p-2 font-mono text-xs" aria-label="Product links" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={copy}>{t('Copy the list')}</Button>
            <Button type="button" variant="outline" onClick={download}>{t('Download CSV for Meta')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
