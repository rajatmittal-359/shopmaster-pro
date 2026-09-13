'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import NotForThisAccount from '@/components/common/NotForThisAccount';

/**
 * My reviews - Flipkart's "Reviews & Ratings", Myntra's "My reviews".
 *
 * The backend had GET /reviews/me since the React days and no page ever
 * used it. A person should be able to find what they said, change their
 * mind (edit lives on the product page, where the form is), or take it back.
 */
const when = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

export default function MyReviews() {
  const { signedIn } = useSession();
  const [reviews, setReviews] = useState(null);

  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;
    authedFetch('/reviews/me')
      .then((d) => {
        if (!cancelled) setReviews(d.reviews || []);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  if (!signedIn) return <NotForThisAccount />;
  if (!reviews) {
    return (
      <div className="skeleton-in space-y-3" aria-busy="true">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const remove = async (r) => {
    const before = reviews;
    setReviews(reviews.filter((x) => x._id !== r._id));
    try {
      await authedFetch(`/reviews/${r._id}`, { method: 'DELETE' });
      toast('Review removed');
    } catch (err) {
      setReviews(before);
      toast.error(err.message);
    }
  };

  if (reviews.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You have not reviewed anything yet. Once an order is delivered, the product page asks you - a photo and two honest lines help the next person most.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {reviews.map((r) => {
        const p = r.productId || {};
        return (
          <li key={r._id} className="flex gap-4 p-4">
            <Link href={`/products/${p.slug || p._id}`} className="relative size-16 shrink-0 overflow-hidden rounded-md border bg-muted">
              {p.images?.[0] && <Image src={p.images[0]} alt="" fill unoptimized className="object-cover" sizes="64px" />}
            </Link>
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/products/${p.slug || p._id}`} className="font-medium hover:underline">
                  {p.name || 'Product'}
                </Link>
                <span className="text-xs text-muted-foreground">{when(r.createdAt)}</span>
              </div>
              <div className="mt-0.5 text-amber-600" aria-label={`${r.rating} out of 5`}>
                {stars(r.rating)}
              </div>
              {r.title && <p className="mt-1 font-medium">{r.title}</p>}
              {r.comment && <p className="text-muted-foreground">{r.comment}</p>}
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" render={<Link href={`/products/${p.slug || p._id}#review`} />} nativeButton={false}>
                  Edit on the product
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(r)}>
                  Remove
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
