'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Check, ImagePlus, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Put a picture the AI made onto one of the seller's products - from where
 * the picture is, not from the product form.
 *
 * WHY THIS EXISTS
 *   The Studio made pictures and left them in a drafts folder. To use one,
 *   the seller had to go to the product, open its photos, and... there was
 *   nothing to pick from. Rajat: "generated to kaise lagaunga?" The answer is
 *   this: a product list right here, choose one, main or gallery, done. The
 *   server writes it; the product's own five-photo cap still applies.
 */
export default function AttachToProduct({ base = '/seller', url, products, open, onClose }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(null); // productId being written

  const shown = products.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40);

  const attach = async (product, position) => {
    setBusy(product._id);
    try {
      await authedFetch(`${base}/ai/attach`, { method: 'POST', body: { productId: product._id, url, position } });
      toast.success(position === 'main' ? `Now the main photo of ${product.name}` : `Added to ${product.name}`, {
        description: 'Saved on the product. Open it to reorder or remove.',
      });
      onClose(product);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose(null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to a product</DialogTitle>
          <DialogDescription>Pick the product, then whether it becomes the main photo or joins the gallery.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border px-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your products"
            className="h-10 flex-1 bg-transparent text-sm outline-none"
            autoFocus
          />
        </div>

        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {shown.length === 0 && <li className="px-2 py-4 text-sm text-muted-foreground">No product called that.</li>}
          {shown.map((p) => (
            <li key={p._id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent/60">
              <span className="relative size-10 shrink-0 overflow-hidden rounded-md border bg-muted">
                {p.images?.[0] && <Image src={p.images[0]} alt="" fill unoptimized className="object-cover" sizes="40px" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{p.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {p.images?.length || 0} of 5 photos
                </span>
              </span>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy === p._id || (p.images?.length || 0) >= 5}
                  onClick={() => attach(p, 'gallery')}
                >
                  {busy === p._id ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                  Gallery
                </Button>
                <Button type="button" size="sm" disabled={busy === p._id || (p.images?.length || 0) >= 5} onClick={() => attach(p, 'main')}>
                  <Check className="size-4" />
                  Main
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
