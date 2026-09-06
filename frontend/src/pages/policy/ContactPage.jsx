import PolicyLayout, { Section } from './PolicyLayout';
import { BUSINESS } from '../../config/policy';

/**
 * Who to reach, and how.
 *
 * A postal address, a working phone and a working email - not a form alone.
 * Razorpay's check and Merchant Center both require all three, and a customer
 * deciding whether to pay a shop they have not heard of looks for exactly this.
 */
export default function ContactPage() {
  return (
    <PolicyLayout
      title="Contact us"
      description="Reach Charming Jewels in Jaipur by phone, email or post."
      path="/contact"
    >
      <p>
        We are a small family jewellery business in Jaipur. A person reads every
        message, so please give us an order number if you have one.
      </p>

      <Section title="Address">
        <address className="not-italic">
          <strong className="text-gray-900">{BUSINESS.legalName}</strong>
          <br />
          {BUSINESS.addressLines.map((line) => (
            <span key={line}>
              {line}
              <br />
            </span>
          ))}
          <span className="text-gray-500">({BUSINESS.landmark})</span>
        </address>
      </Section>

      <Section title="Phone">
        <p>
          <a href={BUSINESS.phoneHref} className="text-brand-ink font-medium">
            {BUSINESS.phone}
          </a>
          <br />
          <span className="text-gray-500">{BUSINESS.hours}</span>
        </p>
      </Section>

      <Section title="Email">
        <p>
          <a href={`mailto:${BUSINESS.email}`} className="text-brand-ink font-medium">
            {BUSINESS.email}
          </a>
          <br />
          <span className="text-gray-500">We reply within one working day.</span>
        </p>
      </Section>

      <Section title="Order questions">
        <p>
          The fastest route is your own order page: sign in and open{' '}
          <strong>My orders</strong>. It shows the courier, the tracking number
          and where the parcel has reached, and it is updated before we are.
        </p>
      </Section>
    </PolicyLayout>
  );
}
