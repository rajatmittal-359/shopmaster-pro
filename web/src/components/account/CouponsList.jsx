import Link from 'next/link';
import { getCoupons } from '@/lib/api';

/**
 * Coupons - Flipkart's "My coupons", Myntra's "Coupons": every code a
 * shopper can use today, with its rules in one line. Public on purpose; a
 * code hidden until checkout is a discount nobody plans a basket around.
 */
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null);

export default async function CouponsList() {
  const coupons = await getCoupons();

  if (!coupons.length) {
    return <p className="text-sm text-muted-foreground">No codes running right now. Sellers add them for festivals and slow weeks - check back, or save what you like and we will show it when it is discounted.</p>;
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {coupons.map((c) => (
        <li key={c.code} className="rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <code className="rounded bg-primary/10 px-2 py-1 text-base font-semibold tracking-wider text-brand-ink">{c.code}</code>
            {c.validUntil && <span className="text-xs text-muted-foreground">till {when(c.validUntil)}</span>}
          </div>
          <p className="mt-2 text-sm font-medium">
            {c.type === 'percent' ? `${c.value}% off` : `${money(c.value)} off`}
            {c.minOrderValue > 0 ? ` on orders over ${money(c.minOrderValue)}` : ''}
            {c.type === 'percent' && c.maxDiscount ? ` · up to ${money(c.maxDiscount)}` : ''}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {c.shop ? (
              <>
                On{' '}
                <Link href={`/shop?search=${encodeURIComponent(c.shop)}`} className="text-brand-ink hover:underline">
                  {c.shop}
                </Link>{' '}
                items only
              </>
            ) : (
              'On everything'
            )}
            {c.description ? ` · ${c.description}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}
