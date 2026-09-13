import Link from 'next/link';
import { POLICY, businessFrom } from '@/config/policy';
import { getSettings } from '@/lib/api';

export const metadata = {
  title: 'Help',
  description: 'Orders, delivery, returns and refunds on ShopMaster Pro - the short answers, and how to reach a person.',
  alternates: { canonical: '/help' },
};

/**
 * Help - Amazon's Customer Service page and Flipkart's Help Centre, at our
 * size: the eight questions that are actually asked, each with the honest
 * answer and a link to the page that does the thing, then a person.
 */
const QA = [
  ['Where is my order?', 'Open My orders - every parcel shows the courier’s own scans and the date it expects to arrive. If that date has passed, the page says "Running late" and what to do.', '/orders', 'My orders'],
  ['Can I cancel?', 'Yes, until the seller hands it to the courier. After that, refuse it at the door or return it once it arrives. The Cancel button appears on the order while it is still possible.', '/orders', 'My orders'],
  ['How do returns work?', `${POLICY.returnDays} days from delivery, from the order page. The pickup rider brings the label - you print nothing. Keep the tag on and the packing.`, '/refund-policy', 'Refund policy'],
  ['When do I get my refund?', `Once the item reaches the seller, the money goes back the way you paid, within ${POLICY.refundDays[0]}–${POLICY.refundDays[1]} working days. Cash on delivery refunds go to a bank account you give us.`, '/refund-policy', 'Refund policy'],
  ['The courier says delivered but I have nothing.', 'On the order page press "Something’s wrong". An admin - not the seller - looks at the courier’s proof and decides within three days.', '/orders', 'My orders'],
  ['Same-day delivery in Jaipur?', 'When the address is in Jaipur and the seller is too, checkout offers it with the price. It is a rider, so it depends on the hour you order.', '/shipping-policy', 'Shipping policy'],
  ['Is this a real shop?', `Yes - run from Jaipur. Our address, phone and hours are on the contact page, and every seller is a real business we have checked.`, '/contact', 'Contact'],
  ['I want to sell here.', 'Apply from your existing account - no second login. The rules are on one page, in numbers, before you agree.', '/sell', 'Sell on ShopMaster Pro'],
];

export default async function HelpPage() {
  const BUSINESS = businessFrom(await getSettings());
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Help</h1>
      <p className="mt-1 text-sm text-muted-foreground">Short answers first. A person after that.</p>

      <dl className="mt-6 divide-y rounded-xl border bg-card">
        {QA.map(([q, a, href, label]) => (
          <div key={q} className="p-4">
            <dt className="font-medium">{q}</dt>
            <dd className="mt-1 text-sm text-muted-foreground">
              {a}{' '}
              <Link href={href} className="whitespace-nowrap text-brand-ink hover:underline">
                {label} →
              </Link>
            </dd>
          </div>
        ))}
      </dl>

      <section className="mt-8 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Talk to a person</h2>
        <p className="mt-1 text-sm text-muted-foreground">Give us the order number if there is one - it saves a message each way.</p>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li>
            <a href={`https://wa.me/${BUSINESS.phoneHref.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-ink hover:underline">
              WhatsApp {BUSINESS.phone}
            </a>
            <span className="text-muted-foreground"> · fastest</span>
          </li>
          <li>
            <a href={`mailto:${BUSINESS.email}`} className="font-medium text-brand-ink hover:underline">
              {BUSINESS.email}
            </a>
          </li>
          <li className="text-muted-foreground">{BUSINESS.hours}</li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Policies in full:{' '}
          <Link href="/shipping-policy" className="hover:underline">Shipping</Link> · <Link href="/refund-policy" className="hover:underline">Refunds</Link> ·{' '}
          <Link href="/privacy" className="hover:underline">Privacy</Link> · <Link href="/terms" className="hover:underline">Terms</Link>
        </p>
      </section>
    </div>
  );
}
