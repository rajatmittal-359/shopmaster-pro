import PolicyHeading from '@/components/policy/PolicyHeading';
import Section from '@/components/policy/Section';
import { businessFrom } from '@/config/policy';
import { getSettings } from '@/lib/api';

/**
 * A postal address, a working phone and a working email - not a form alone.
 * Razorpay's check and Merchant Center both require all three, and a customer
 * deciding whether to pay a shop they have not heard of looks for exactly this.
 */
export const metadata = {
  title: 'Contact us',
  description: 'Reach ShopMaster Pro in Jaipur by phone, email or post.',
  alternates: { canonical: '/contact' },
};

export default async function ContactPage() {
  const BUSINESS = businessFrom(await getSettings());
  return (
    <>
      <PolicyHeading title="Contact us" />

      <p>
        ShopMaster Pro is a marketplace run from Jaipur. Every item is sold by
        an independent seller named on its page; the platform arranges payment,
        delivery and returns. Every message reaches a person here first - so
        please give us an order number if you have one.
      </p>

      <Section title="Address">
        <address className="not-italic">
          <strong>{BUSINESS.legalName}</strong>
          <br />
          {BUSINESS.addressLines.map((line) => (
            <span key={line}>
              {line}
              <br />
            </span>
          ))}
          <span>({BUSINESS.landmark})</span>
        </address>
        {/* The map, Google's keyless embed: no API key, no billing account,
            no quota - the same iframe Google's own "Share → Embed a map"
            hands out. A shop people can find on a map is one people trust. */}
        <div className="mt-4 overflow-hidden rounded-xl border">
          <iframe
            title={`${BUSINESS.legalName} on the map`}
            src={`https://maps.google.com/maps?q=${encodeURIComponent(`${BUSINESS.legalName}, ${BUSINESS.addressLines.join(', ')}`)}&z=16&output=embed`}
            width="100%"
            height="260"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
            className="block w-full"
          />
        </div>
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${BUSINESS.legalName}, ${BUSINESS.addressLines.join(', ')}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm font-medium text-brand-ink hover:underline"
        >
          Get directions
        </a>
      </Section>

      <Section title="Phone">
        <p>
          <a href={BUSINESS.phoneHref} className="font-medium text-brand-ink hover:underline">
            {BUSINESS.phone}
          </a>
          <br />
          {BUSINESS.hours}
        </p>
      </Section>

      <Section title="Email">
        <p>
          <a
            href={`mailto:${BUSINESS.email}`}
            className="font-medium text-brand-ink hover:underline"
          >
            {BUSINESS.email}
          </a>
          <br />
          We reply within one working day.
        </p>
      </Section>

      {/* Consumer Protection (E-Commerce) Rules 2020, rule 4(4)-(5): the
          grievance officer's name, designation and contact, on the platform;
          acknowledgement within 48 hours, redress within one month. */}
      <Section title="Grievance officer">
        {BUSINESS.grievance ? (
          <>
            <p>
              <strong>{BUSINESS.grievance.name}</strong>, {BUSINESS.grievance.designation}
              <br />
              <a href={`mailto:${BUSINESS.grievance.email}`} className="text-brand-ink hover:underline">{BUSINESS.grievance.email}</a>
              {BUSINESS.grievance.phone ? <> · {BUSINESS.grievance.phone}</> : null}
            </p>
            <p>
              Write with your order number and what went wrong. We acknowledge every
              complaint within 48 hours and resolve it within one month, as the
              Consumer Protection (E-Commerce) Rules 2020 require. If we fail you,
              the National Consumer Helpline is 1915 (consumerhelpline.gov.in).
            </p>
          </>
        ) : (
          <p>
            Complaints go to {BUSINESS.email}. We acknowledge every complaint within
            48 hours and resolve it within one month, as the Consumer Protection
            (E-Commerce) Rules 2020 require. The National Consumer Helpline is 1915.
          </p>
        )}
      </Section>

      <Section title="Order questions">
        <p>
          The fastest route is your own order page: sign in and open{' '}
          <strong>My orders</strong>. It shows the courier, the tracking number
          and where the parcel has reached, and it is updated before we are.
        </p>
      </Section>
    </>
  );
}
