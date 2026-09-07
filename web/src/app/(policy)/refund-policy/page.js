import PolicyHeading from '@/components/policy/PolicyHeading';
import Section from '@/components/policy/Section';
import { POLICY, BUSINESS } from '@/config/policy';

/**
 * The return window here is POLICY.returnDays, which must equal
 * RETURN_WINDOW_DAYS in backend/utils/payout.js - that constant is what
 * actually refuses a late return, and what holds a seller's payout until the
 * window has closed. A page promising longer than the code allows would be a
 * promise the shop cannot keep.
 */
export const metadata = {
  title: 'Cancellations, returns and refunds',
  description:
    'How to cancel an order, return an item, and when the money comes back.',
  alternates: { canonical: '/refund-policy' },
};

export default function RefundPolicyPage() {
  const [refundMin, refundMax] = POLICY.refundDays;

  return (
    <>
      <PolicyHeading title="Cancellations, returns and refunds" />

      <Section title="Cancelling before dispatch">
        <p>
          You can cancel any order that has not yet been shipped, yourself, from{' '}
          <strong>My orders</strong>. Nothing is charged for cancelling, and a
          prepaid order is refunded in full.
        </p>
      </Section>

      <Section title="Returns after delivery">
        <p>
          You have <strong>{POLICY.returnDays} days from delivery</strong> to
          start a return. Ask for it from <strong>My orders</strong>; the button
          disappears once the window closes, so please do not leave it late.
        </p>
        <p>The item must come back:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>unused and undamaged,</li>
          <li>with its tags and original packaging, and</li>
          <li>with everything that came in the parcel.</li>
        </ul>
      </Section>

      <Section title="Exchanges">
        <p>
          When you start a return you choose{' '}
          <strong>your money back, or the same item again</strong>. Ask for a
          replacement and nothing is refunded: once your item reaches the seller
          they send out a new one, and there is nothing more to pay &mdash; the
          replacement is delivered free.
        </p>
        <p>
          We exchange an item for the same item. If you want something different,
          take the refund and order the piece you want &mdash; that way you see
          what you are buying and pay the right price for it.
        </p>
        <p>
          If the seller has none left to send, they will tell you and refund you
          instead. You can follow the replacement from <strong>My orders</strong>{' '}
          exactly like the first parcel.
        </p>
      </Section>

      <Section title="What cannot be returned">
        <p>
          Items made or engraved to your order, and pierced jewellery such as
          earrings and nose pins once the seal is opened &mdash; for hygiene
          reasons, which is the standard across Indian jewellery retail.
        </p>
        <p>
          This does not affect a faulty or wrong item. If we sent the wrong thing,
          or it arrived damaged, tell us and we will put it right whatever the
          category.
        </p>
      </Section>

      <Section title="Damaged or wrong items">
        <p>
          Contact us within <strong>48 hours</strong> of delivery at{' '}
          <a href={'mailto:' + BUSINESS.email} className="text-brand-ink hover:underline">
            {BUSINESS.email}
          </a>{' '}
          with your order number and a photograph. We arrange the return ourselves
          and you pay nothing.
        </p>
      </Section>

      <Section title="When the money comes back">
        <p>
          Refunds are issued once the returned item reaches the seller and has
          been checked. The money goes back <strong>to the way you paid</strong>{' '}
          &mdash; card, UPI, netbanking or wallet &mdash; and reaches you in{' '}
          <strong>
            {refundMin}&ndash;{refundMax} working days
          </strong>{' '}
          after that, depending on your bank.
        </p>
        <p>
          For a cash-on-delivery order we collect your bank details and transfer
          the refund there, since there is no card to return it to.
        </p>
      </Section>

      <Section title="Return shipping">
        <p>
          We pay the return shipping when the fault is ours &mdash; a wrong,
          damaged or faulty item. For a change of mind, the return courier is at
          your cost.
        </p>
      </Section>
    </>
  );
}
