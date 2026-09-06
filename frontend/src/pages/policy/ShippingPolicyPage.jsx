import PolicyLayout, { Section } from './PolicyLayout';
import { POLICY, BUSINESS } from '../../config/policy';

/**
 * Every number here comes from src/config/policy.js, which is the same source
 * the Product structured data uses. They cannot say different things.
 */
export default function ShippingPolicyPage() {
  const [handleMin, handleMax] = POLICY.handlingDays;
  const [transitMin, transitMax] = POLICY.transitDays;

  return (
    <PolicyLayout
      title="Shipping policy"
      description="How and when orders from Charming Jewels are dispatched and delivered."
      path="/shipping-policy"
    >
      <Section title="Where we deliver">
        <p>Anywhere in India. We do not ship outside India at present.</p>
      </Section>

      <Section title="Dispatch">
        <p>
          Orders are handed to the courier within{' '}
          <strong>
            {handleMin}&ndash;{handleMax} working days
          </strong>{' '}
          of the order being confirmed. Orders placed on a Sunday or a public
          holiday are dispatched the next working day.
        </p>
      </Section>

      <Section title="Delivery time">
        <p>
          Once dispatched, delivery usually takes{' '}
          <strong>
            {transitMin}&ndash;{transitMax} working days
          </strong>
          , depending on your PIN code and the courier serving it. Remote PIN
          codes can take longer.
        </p>
        <p>
          These are the courier&rsquo;s estimates, not guarantees. We will tell
          you if a parcel is delayed rather than leave you guessing.
        </p>
      </Section>

      <Section title="Shipping charges">
        <p>
          Delivery is charged by weight and destination, and the exact amount is
          shown at checkout <strong>before</strong> you pay &mdash; never added
          afterwards. Some products are marked free delivery, and those show as
          Free at checkout.
        </p>
      </Section>

      <Section title="Tracking">
        <p>
          As soon as the seller hands the parcel over we email you the courier
          name and tracking number. The same details stay on your order page
          under <strong>My orders</strong>.
        </p>
      </Section>

      <Section title="Cash on delivery">
        <p>
          Where offered, cash on delivery is paid directly to the delivery agent
          when the parcel arrives.
        </p>
      </Section>

      <Section title="If nobody is home">
        <p>
          Couriers usually attempt delivery more than once and will call the
          number on the order. If the parcel returns to us undelivered, contact
          us at {BUSINESS.email} and we will arrange a re-send or a refund.
        </p>
      </Section>
    </PolicyLayout>
  );
}
