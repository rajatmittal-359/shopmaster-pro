'use client';

import { useEffect, useState } from 'react';
import { apiBase } from '@/lib/api';
import { recentIds } from '@/lib/recentlyViewed';
import ProductCard from '@/components/product/ProductCard';

/**
 * "Recently viewed" (E4, 22 Sep 2026): the strip Amazon and Flipkart put
 * near the bottom of the home page and under the product. Client-only - the
 * memory is the browser's - and it renders nothing until it has at least
 * two cards, so a first visit never sees an empty heading. `exclude` keeps
 * the product being read off its own strip.
 */
export default function RecentlyViewed({ exclude = null, title = 'Recently viewed', limit = 8 }) {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const ids = recentIds().filter((id) => id !== String(exclude)).slice(0, limit);
    if (ids.length < 2) return undefined;
    let cancelled = false;
    fetch(`${apiBase}/public/products/by-ids?ids=${ids.join(',')}`)
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) => { if (!cancelled) setProducts(d.products || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [exclude, limit]);

  if (products.length < 2) return null;

  return (
    <section className="mt-12" aria-labelledby="recently-viewed">
      <h2 id="recently-viewed" className="font-display text-lg font-semibold">{title}</h2>
      <div className="stagger mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {products.slice(0, limit).map((p) => <ProductCard key={p._id} product={p} />)}
      </div>
    </section>
  );
}
