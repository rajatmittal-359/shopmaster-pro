import Link from 'next/link';
import PolicyHeading from '@/components/policy/PolicyHeading';
import Section from '@/components/policy/Section';
import { POLICY, BUSINESS, COMMISSION_RATE } from '@/config/policy';

/**
 * The rules a seller agrees to.
 *
 * WHY IT EXISTS NOW RATHER THAN AFTER THE FIRST ARGUMENT
 *   Every guide to running a marketplace says the same thing: define quality
 *   guidelines, performance expectations and how disputes are decided BEFORE
 *   the first outside seller goes live. Writing them afterwards is both a
 *   customer problem and a legal exposure, because the first time they are
 *   read is the moment somebody is being told they broke a rule that did not
 *   exist yesterday.
 *
 * EVERY RULE HERE IS ONE THE CODE ALREADY ENFORCES
 *   The return window is RETURN_WINDOW_DAYS. The commission is
 *   DEFAULT_COMMISSION_RATE. Payouts really are held until the window closes.
 *   Suspension really does hide products and leave open orders running. A
 *   policy page that promises something the software does not do is worse than
 *   none - it is a promise nobody can keep.
 */
export const metadata = {
  title: 'Selling on ShopMaster Pro',
  description:
    'The rules for selling on ShopMaster Pro: what you may list, when to dispatch, how returns and disputes are decided, and when you are paid.',
  alternates: { canonical: '/selling-policy' },
};

export default function SellingPolicyPage() {
  const [handleMin, handleMax] = POLICY.handlingDays;

  return (
    <>
      <PolicyHeading title="Selling on ShopMaster Pro" updated="9 September 2026" />

      <p>
        These are the terms every seller here agrees to. They are short on
        purpose, and every one of them is something the platform actually does -
        not an intention.
      </p>

      <Section title="Getting approved">
        <p>
          Anybody with an account can apply from{' '}
          <Link href="/sell" className="text-brand-ink hover:underline">
            Sell on ShopMaster Pro
          </Link>
          . A person reads every application. Nothing you list is public until
          your shop is approved, and you can open your dashboard while you wait.
        </p>
        <p>
          You keep the same account you shop with. Selling is added to it - you
          do not get a second login, and your orders as a customer stay yours.
        </p>
      </Section>

      <Section title="What you may list">
        <ul className="list-disc space-y-1 pl-5">
          <li>Only goods you actually have and can dispatch.</li>
          <li>
            Photographs of the real item. Not the manufacturer&rsquo;s picture of
            something similar.
          </li>
          <li>
            An honest MRP. Under the Legal Metrology rules it is the maximum
            price the item may lawfully be sold at - it is not a bigger number
            to make the discount look better, and the platform refuses a selling
            price above it.
          </li>
          <li>
            Nothing counterfeit, nothing you are not entitled to sell, and
            nothing that needs a licence you do not hold.
          </li>
          <li>
            The right category. Products are listed in subcategories, and a
            piece filed in the wrong one is a piece nobody browsing will find.
          </li>
        </ul>
      </Section>

      <Section title="Dispatching">
        <p>
          Orders are handed to the courier within{' '}
          <strong>
            {handleMin}&ndash;{handleMax} working days
          </strong>{' '}
          of confirmation - that is what the shipping policy promises customers,
          so it is what you are promising too.
        </p>
        <p>
          Booking the courier is one button and it spends real money from the
          platform&rsquo;s account, so book it when the parcel is packed. Keep
          your stock count right: overselling means cancelling on somebody who
          has already paid.
        </p>
      </Section>

      <Section title="Returns, and who decides">
        <p>
          A customer may start a return within <strong>{POLICY.returnDays} days</strong>{' '}
          of delivery, and they choose their money back or the same item again.
        </p>
        <p>
          You may refuse a return - it never arrived, it came back used, a
          different item was sent back - but you must say why, and the customer
          can dispute it. <strong>A dispute is decided by the platform, and that
          decision is final.</strong> Both sides are shown the reason it was
          decided that way.
        </p>
        <p>
          We pay the return courier when the fault is ours or yours; a change of
          mind is at the customer&rsquo;s cost.
        </p>
      </Section>

      <Section title="Money">
        <p>
          The platform charges <strong>{COMMISSION_RATE}% commission</strong> and
          nothing else - no listing fee, no closing fee, no fee for collecting
          the payment. The rate is copied onto every order at the moment it is
          placed, so a change never re-prices what you have already sold.
        </p>
        <p>
          A payout is released <strong>{POLICY.returnDays} days after each
          delivery</strong>, once the return window on it has closed. Money that
          could still come back is not money we can pay out and then chase.
        </p>
        <p>
          Bank details are yours to keep correct. A transfer to a wrong account
          does not come back.
        </p>
      </Section>

      <Section title="How a shop gets suspended">
        <p>
          Not dispatching, repeated cancellations, complaints about quality, or
          anything that looks like fraud. If it happens, your products come out
          of the shop immediately - but{' '}
          <strong>orders already placed still have to be delivered</strong>,
          returns still have to be settled, and your payouts are still paid.
          Suspension stops new business; it does not cancel old obligations,
          in either direction.
        </p>
      </Section>

      <Section title="Questions">
        <p>
          {BUSINESS.email} · {BUSINESS.phone}. A person answers, usually the same
          day.
        </p>
      </Section>
    </>
  );
}
