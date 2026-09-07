import PolicyHeading from '@/components/policy/PolicyHeading';
import Section from '@/components/policy/Section';
import { BUSINESS } from '@/config/policy';

/**
 * Written from what the application ACTUALLY does.
 *
 * Every processor named below is one the code really calls - Razorpay for
 * payment, Shiprocket for delivery, Brevo for email, Cloudinary for images,
 * MongoDB Atlas for storage. A privacy policy listing services a shop does not
 * use, or omitting ones it does, is worse than none: it is a statement of fact
 * that happens to be false.
 */
export const metadata = {
  title: 'Privacy policy',
  description:
    'What Charming Jewels collects, why, who it is shared with, and your rights.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <>
      <PolicyHeading title="Privacy policy" updated="6 September 2026" />

      <p>
        We collect the least we can, and share it only with the companies that
        actually deliver your order. We do not sell your data to anyone.
      </p>

      <Section title="What we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your name and email address, when you create an account.</li>
          <li>
            Your delivery address and phone number, when you place an order
            &mdash; a courier cannot deliver without them.
          </li>
          <li>Your order history.</li>
          <li>Reviews and ratings you choose to write.</li>
        </ul>
        <p>
          We do <strong>not</strong> store your card, UPI or bank details. Those
          go straight to Razorpay and never reach our servers.
        </p>
      </Section>

      <Section title="Why we hold it">
        <p>
          To take your order, deliver it, handle returns and refunds, answer your
          questions, and keep the records a business is required to keep.
        </p>
      </Section>

      <Section title="Who we share it with">
        <p>Only where the work cannot be done otherwise:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Razorpay</strong> &mdash; to take payment and issue refunds.
          </li>
          <li>
            <strong>Shiprocket</strong> and its courier partners &mdash; your
            name, address and phone, so the parcel can be delivered.
          </li>
          <li>
            <strong>Brevo</strong> &mdash; to send order and account emails.
          </li>
          <li>
            <strong>The seller of your item</strong> &mdash; what they need to
            pack and dispatch it.
          </li>
        </ul>
        <p>
          The site runs on Render, data is stored with MongoDB Atlas, and product
          images are hosted by Cloudinary. We never sell your data, and we do not
          share it for anyone else&rsquo;s advertising.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          We keep you signed in using storage in your own browser. We do not use
          advertising or tracking cookies. If we add analytics, we will say so
          here first.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Order records are kept for as long as the law requires business records
          to be kept. Ask us to close your account and we will delete what we are
          not required to keep.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Ask us for a copy of what we hold about you, ask us to correct it, or
          ask us to delete it. Write to{' '}
          <a href={'mailto:' + BUSINESS.email} className="text-brand-ink hover:underline">
            {BUSINESS.email}
          </a>{' '}
          and we will reply within one working day.
        </p>
      </Section>

      <Section title="Children">
        <p>
          This shop is not intended for children under 18, and we do not knowingly
          collect their information.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          {BUSINESS.legalName}, {BUSINESS.addressLines.join(', ')}. Phone{' '}
          {BUSINESS.phone}.
        </p>
      </Section>
    </>
  );
}
