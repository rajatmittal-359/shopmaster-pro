'use client';

import Link from 'next/link';
import { useSession } from '@/lib/session';
import AskPanel from './AskPanel';

/**
 * The customer's Ask ShopMaster, on the Help page. Signed-in only: the
 * useful answers ("where is my order", "when is my refund") need the
 * person's own orders, and a signed-out visitor has the FAQ above.
 */
export default function HelpAsk() {
  const { signedIn, capabilities } = useSession();
  // An admin-only account has no orders to ask about; the panel is theirs at /admin/ask.
  if (signedIn && capabilities && !capabilities.customer) return null;
  return (
    <section className="mt-8">
      <h2 className="font-semibold">Ask ShopMaster</h2>
      <p className="mt-1 text-sm text-muted-foreground">Where your order is, when a refund lands, how a return works - answered from your own orders, in Hindi, Hinglish or English.</p>
      {signedIn ? (
        <div className="mt-3">
          <AskPanel role="customer" compact />
        </div>
      ) : (
        <p className="mt-2 text-sm">
          <Link href="/login?next=/help" className="font-medium text-brand-ink hover:underline">Sign in</Link> <span className="text-muted-foreground">to ask about your own orders and refunds.</span>
        </p>
      )}
    </section>
  );
}
