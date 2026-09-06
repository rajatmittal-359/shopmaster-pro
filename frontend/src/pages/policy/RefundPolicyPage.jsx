import PolicyLayout, { Section } from './PolicyLayout';
import { POLICY, BUSINESS } from '../../config/policy';

/**
 * The return window here is POLICY.returnDays, which must equal
 * RETURN_WINDOW_DAYS in backend/utils/payout.js - that constant is what
 * actually refuses a late return, and what holds a seller's payout until the
 * window has closed. A page promising longer than the code allows would be a
 * promise the shop cannot keep.
 */
export default function RefundPolicyPage() {
  const [refundMin, refundMax] = POLICY.refundDays;

  return (
    <PolicyLayout
      title="Cancellations, returns and refunds"
      description="How to cancel an order, return an item, and when the money comes back."
      path="/refund-policy"
    >
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
        <ul className="list-disc pl-5 space-y-1">
          <li>unused and undamaged,</li>
          <li>with its tags and original packaging, and</li>
          <li>with everything that came in the parcel.</li>
        </ul>
      </Section>

      <Section title="What cannot be returned">
        <p>
          Items made or engraved to your order, and pierced jewellery such as
          earrings and nose pins once the seal is opened &mdash; for hygiene
          reasons, which is the standard across Indian jewellery retail.
        </p>
        <p>
          This does not affect a faulty or wrong item. If we sent the wrong
          thing, or it arrived damaged, tell us and we will put it right
          whatever the category.
        </p>
      </Section>

      <Section title="Damaged or wrong items">
        <p>
          Contact us within <strong>48 hours</strong> of delivery at{' '}
          <a href={`mailto:${BUSINESS.email}`} className="text-brand-ink">
            {BUSINESS.email}
          </a>{' '}
          with your order number and a photograph. We arrange the return
          ourselves and you pay nothing.
        </p>
      </Section>

      <Section title="When the money comes back">
        <p>
          Refunds are issued once the returned item reaches the seller and has
          been checked. The money goes back{' '}
          <strong>to the way you paid</strong> &mdash; card, UPI, netbanking or
          wallet &mdash; and reaches you in{' '}
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
    </PolicyLayout>
  );
}
