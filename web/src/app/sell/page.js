import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { POLICY, BUSINESS } from '@/config/policy';

export const metadata = {
  title: 'Sell on ShopMaster Pro',
  description:
    'List your products on a Jaipur marketplace. We book the courier, handle returns, and pay you once the return window closes.',
  alternates: { canonical: '/sell' },
};

/**
 * The page a prospective seller is sent to.
 *
 * WHY IT SAYS THE UNCOMFORTABLE PARTS OUT LOUD
 *   Commission, when the money arrives, and who pays return shipping. A seller
 *   who discovers any of those at payout time is a seller who leaves - and
 *   tells the next one. Every marketplace that grew from nothing did it on
 *   sellers telling each other it was fair.
 */
export default function SellPage() {
  const steps = [
    ['You apply', 'Create an account and tick the selling box. It takes a minute.'],
    ['We approve you', 'A person checks the shop. Nothing of yours is public until then.'],
    ['You list your products', 'Photographs, price, stock. As many as you like.'],
    ['We handle the courier', 'One button books the pickup. Labels, tracking and returns are ours.'],
    [
      'You get paid',
      `Your earning, less commission, once the ${POLICY.returnDays}-day return window has closed on each delivery.`,
    ],
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Sell on ShopMaster Pro</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        A marketplace run from Jaipur by {BUSINESS.legalName}. You bring the
        products; we bring the shop, the courier and the customers.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/register?sell=1">Apply to sell</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/contact">Ask a question first</Link>
        </Button>
      </div>

      <ol className="mt-12 space-y-6">
        {steps.map(([title, note], i) => (
          <li key={title} className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {i + 1}
            </span>
            <span>
              <strong>{title}</strong>
              <span className="block text-muted-foreground">{note}</span>
            </span>
          </li>
        ))}
      </ol>

      <section className="mt-12 rounded-xl border border-border p-6">
        <h2 className="font-semibold">The things worth knowing before you start</h2>
        <ul className="mt-3 space-y-2 text-[15px] leading-7 text-muted-foreground">
          <li>
            <strong className="text-foreground">Commission</strong> is set per shop
            and shown on your own settings page. It is copied onto each order when
            it is placed, so a change never re-prices what you have already sold.
          </li>
          <li>
            <strong className="text-foreground">Payouts</strong> are released{' '}
            {POLICY.returnDays} days after each delivery - the return window has to
            close first, because a refunded order cannot be clawed back from a
            payout already made.
          </li>
          <li>
            <strong className="text-foreground">Returns</strong> are the customer&rsquo;s
            right within {POLICY.returnDays} days. You choose whether to book the
            pickup; a return you refuse can be disputed, and the platform decides.
          </li>
          <li>
            <strong className="text-foreground">Cash on delivery</strong> means you
            collect at the door and the money is settled with your payout.
          </li>
        </ul>
      </section>
    </div>
  );
}
