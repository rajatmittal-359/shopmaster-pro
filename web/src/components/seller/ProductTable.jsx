'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * The seller's own catalogue.
 *
 * STOCK IS EDITED IN PLACE
 *   Correcting a count is the single most frequent thing a seller does, and it
 *   is the thing that goes wrong when it is buried in an edit form: the number
 *   drifts from the shelf, the shop oversells, and somebody's order gets
 *   cancelled. One field, one save, no page change.
 *
 * EVERY SAVE ASKS WHY
 *   `reason` is passed to the API, which writes an inventory log. Six months
 *   later "why does this say 4 when I counted 2" has an answer.
 *
 * RESERVED IS SHOWN SEPARATELY
 *   Stock minus reserved is what a shopper can actually buy. A seller looking
 *   at "5" while three are inside unpaid checkouts is looking at a number that
 *   is true and useless.
 */
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function ProductTable() {
  const [products, setProducts] = useState([]);
  const [state, setState] = useState({ status: 'loading' });
  const [edits, setEdits] = useState({});

  const load = async () => {
    const data = await authedFetch('/seller/products');
    setProducts(data.products || []);
    setState({ status: 'idle' });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authedFetch('/seller/products');
        if (cancelled) return;
        setProducts(data.products || []);
        setState({ status: 'idle' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveStock = async (product) => {
    const value = edits[product._id];
    if (value === undefined || value === '') return;

    setState({ status: 'saving' });
    try {
      await authedFetch(`/seller/products/${product._id}/stock`, {
        method: 'PATCH',
        body: { stock: Number(value), reason: 'Counted by the seller' },
      });
      setEdits((current) => ({ ...current, [product._id]: undefined }));
      await load();
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  if (state.status === 'loading') return <p className="text-muted-foreground">Loading…</p>;

  if (products.length === 0) {
    return <p className="text-muted-foreground">Nothing listed yet.</p>;
  }

  return (
    <div>
      <p aria-live="polite" className="min-h-5 text-sm">
        {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
      </p>

      <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
        {products.map((product) => {
          const available = Math.max(0, (product.stock || 0) - (product.reserved || 0));
          const edited = edits[product._id];

          return (
            <li key={product._id} className="flex flex-wrap items-center gap-4 p-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                {product.images?.[0] && (
                  <Image src={product.images[0]} alt="" fill sizes="56px" className="object-cover" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <Link
                  href={`/products/${product.slug || product._id}`}
                  className="font-medium hover:text-brand-ink"
                >
                  {product.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {money(product.price)}
                  {!product.isActive && ' · hidden from the shop'}
                  {product.reserved > 0 && ` · ${product.reserved} held in checkouts`}
                  {' · '}
                  <Link href={`/seller/products/${product._id}`} className="text-brand-ink hover:underline">
                    Edit
                  </Link>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`stock-${product._id}`}>
                  Stock for {product.name}
                </label>
                <Input
                  id={`stock-${product._id}`}
                  inputMode="numeric"
                  value={edited ?? product.stock ?? 0}
                  onChange={(e) =>
                    setEdits({ ...edits, [product._id]: e.target.value.replace(/\D/g, '') })
                  }
                  className="w-20"
                />
                <Button
                  onClick={() => saveStock(product)}
                  disabled={edited === undefined || String(edited) === String(product.stock)} variant="outline" size="sm">
                  Save
                </Button>
                <span
                  className={`w-24 text-right text-sm ${available === 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {available === 0 ? 'None to sell' : `${available} sellable`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
