import Link from 'next/link';
import PolicyHeading from '@/components/policy/PolicyHeading';
import Section from '@/components/policy/Section';
import { BUSINESS, POLICY } from '@/config/policy';
import { getSellerRules } from '@/lib/api';

/**
 * The Seller Agreement - every rule a shop lives by here, in one place, read
 * and accepted BEFORE the first listing.
 *
 * THE SHAPE, FROM THE REFERENCES (12 Sep 2026)
 *   Amazon's Business Solutions Agreement, Flipkart's Seller Terms and
 *   Meesho's Supplier Agreement all do the same thing: one document, numbered
 *   sections, consent at signup, the money rules stated as numbers. Ours is
 *   theirs at the size of a Jaipur marketplace - shorter, plainer, and with
 *   the numbers pulled from the same file the code enforces
 *   (backend/config/sellerRules.js), so the page can never promise what the
 *   payout does not do.
 *
 * WHY NO GST APPEARS
 *   Neither the platform nor its own shop is GST-registered, so no tax is
 *   added to commission or charges. The number written is the number taken.
 *   Sellers handle their own tax on their own sales; that is said plainly.
 */
export const metadata = {
  title: 'Seller Agreement',
  description: 'The rules for selling on ShopMaster Pro: approval, listings, dispatch, cancellations, returns, disputes, payouts and commission.',
};

export default async function SellingPolicyPage() {
  const rules = await getSellerRules();
  const r = rules || {};

  return (
    <>
      <PolicyHeading title={`Seller Agreement · version ${r.version || '1.0'}`} updated={r.effectiveFrom ? new Date(r.effectiveFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '12 September 2026'} />

      <p>
        This is the agreement between you, a seller, and {BUSINESS.legalName}, which operates ShopMaster
        Pro. You accept it when you apply to sell. When a rule changes we raise the version number and ask
        you to read and accept it again before you can act in the seller panel. Nothing here is hidden in
        another page: the numbers below are the numbers the platform enforces.
      </p>

      <Section title="1. Who can sell, and approval">
        <p>
          Anyone with an account can apply with a shop name. A person reviews every application; nothing of
          yours is public until approved. We may decline or later suspend a shop for the reasons in section 10.
          You confirm you are 18 or older and that you have the right to sell what you list.
        </p>
      </Section>

      <Section title="2. What you may list, and how">
        <p>
          Your own products, honestly described: photographs of the actual item, a price that includes all
          taxes, an MRP only where a real MRP exists, and stock counts you can actually supply. Imitation
          jewellery must be described as imitation; no claims of gold, silver, hallmarking or gemstones that
          are not true. No counterfeits, no items that are illegal to sell in India, no medicines, weapons or
          adult goods. We remove listings that break this without notice and may suspend the shop.
        </p>
      </Section>

      <Section title="3. Dispatch">
        <p>
          A paid order is handed to the courier within <strong>{r.dispatchDays ?? 2} business days</strong>. You
          book the pickup from the order card; the courier and label are ours. An order not dispatched in time is
          counted against your account health (section 9).
        </p>
      </Section>

      <Section title="4. Cancelling an order you accepted">
        <p>
          A customer who paid and was told &ldquo;accepted&rdquo; is let down when you cancel. So: cancellations you cause
          (out of stock, damaged, cannot deliver) are free for the first{' '}
          <strong>{r.cancelFreePer30Days ?? 2} in any 30 days</strong>. Every one after that costs{' '}
          <strong>₹{r.cancelPenalty ?? 50}</strong>, deducted from your next payout and shown on the order card
          with the reason. A cancellation the customer asked for, or one the platform made, is never charged.
          Amazon charges up to 10 % of the order for the same thing and Flipkart ₹60; ours is flat so you can
          predict it, and no tax is added to it.
        </p>
      </Section>

      <Section title="5. Returns and exchanges">
        <p>
          The customer may ask for a return or exchange within <strong>{r.returnWindowDays ?? POLICY.returnDays} days of delivery</strong>.
          You book the reverse pickup; the rider brings the label. You may refuse a return only for the reasons
          offered on the order card (it never came back, it came back used or damaged, a different item was
          sent back, it was asked for late). A refused return can be disputed by the customer, and then the
          platform decides (section 6).
        </p>
      </Section>

      <Section title="6. Disputes">
        <p>
          When a customer says a parcel never arrived, arrived wrong, or a return was wrongly refused, the
          payout for that order is held and the dispute goes to an admin. You have{' '}
          <strong>{r.disputeResponseHours ?? 72} hours</strong> to respond with evidence - the courier&apos;s proof of
          delivery, photographs, the tracking history are all on the order. The platform decides on the
          evidence, and its decision is final for that order. Deciding against a seller repeatedly is a reason
          for review under section 9.
        </p>
      </Section>

      <Section title="7. Money: what you earn and when">
        <p>
          You earn the price the customer paid for your lines, less commission. Commission is{' '}
          <strong>{r.defaultCommissionPct ?? 8} % of each sale</strong> unless an admin has set a different rate for
          your shop; your own rate is always on your settings page. The rate is copied onto each order when it is
          placed, so a later change never re-prices what you already sold. No listing fee, no closing fee, no fee
          for collecting the payment.
        </p>
        <p>
          Payouts are released <strong>{r.payoutAfterDeliveryDays ?? 7} days after each delivery</strong> - the
          return window has to close first, because a refunded order cannot be clawed back from a payout already
          made - to the bank account on your earnings page, less any charges under section 4. On cash-on-delivery
          orders you collect at the door and the amount is settled with your payout.
        </p>
        <p>
          {BUSINESS.legalName} is not GST-registered; no GST is added to commission or charges. You are
          responsible for any tax on your own sales and for your own invoices to customers where the law requires
          them.
        </p>
      </Section>

      <Section title="8. Your customers' data">
        <p>
          You see a customer&apos;s name, address and phone only for orders you are fulfilling, and only to fulfil
          them. You may not copy, sell or contact customers for anything other than their order. Reviews are
          written by verified buyers and may not be bought, traded or removed by you.
        </p>
      </Section>

      <Section title="9. Account health">
        <p>
          We measure, for every shop over the last 30 days: the share of accepted orders you cancelled
          (reviewed above <strong>{r.cancelRateReviewPct ?? 5} %</strong>), late dispatches, disputes decided
          against you, and return rates far above the platform&apos;s. You see your own numbers on your dashboard
          before we act on them. Crossing a line brings a warning first, then a review, then suspension.
        </p>
      </Section>

      <Section title="10. Suspension and leaving">
        <p>
          A shop is suspended, with notice and the reason, for listing prohibited or misdescribed goods,
          repeated cancellations or late dispatch, misuse of customer data, or abuse of the returns or disputes
          process. Orders already accepted must still be fulfilled or refunded. Payouts already earned are paid,
          less any charges and any disputed amounts. You may close your shop at any time by asking us; the same
          applies to open orders and earned payouts.
        </p>
      </Section>

      <Section title="11. Changes to this agreement">
        <p>
          When a rule changes, the version number changes and every seller is asked to read and accept the new
          version before acting in the panel. Wording that changes nothing does not change the version. The
          current version is always at this address.
        </p>
      </Section>

      <Section title="12. Questions">
        <p>
          Before you apply or at any time after,{' '}
          <Link href="/contact" className="text-brand-ink hover:underline">talk to us</Link>. The rest of the
          shop&apos;s policies - shipping, returns, privacy, pricing - are linked in the footer and apply to you as
          they apply to every customer.
        </p>
      </Section>
    </>
  );
}
