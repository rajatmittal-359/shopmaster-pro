import PolicyHeading from '@/components/policy/PolicyHeading';
import Section from '@/components/policy/Section';
import { businessFrom } from '@/config/policy';
import { getSettings } from '@/lib/api';

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
    'What ShopMaster Pro collects, why, who it is shared with, and your rights.',
  alternates: { canonical: '/privacy' },
};

export default async function PrivacyPage() {
  // Live identity from Settings (admin), the code's default underneath.
  const BUSINESS = businessFrom(await getSettings());
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

      <Section title="Cookies" id="cookies">
        <p>
          <strong>Necessary cookies</strong> keep you signed in, remember your
          cart and your light/dark choice, and protect forms from misuse. The
          site cannot work without them, so they need no choice.
        </p>
        <p>
          <strong>Analytics</strong> (Google Analytics 4) tells us which pages
          help and where people stop. Until you accept, it counts visits
          without setting a cookie and without identifying you.
        </p>
        <p>
          <strong>Advertising</strong> (the Meta Pixel) lets us show products you
          looked at here to you again on Facebook or Instagram, and lets Meta
          measure whether an advertisement led to an order. It runs only after
          you choose <em>Accept all</em>, and when it does, we also send Meta a
          hashed (unreadable) form of your email and phone with an order so the
          same purchase is not counted twice. Meta&rsquo;s own use of that data
          is described in their privacy policy.
        </p>
        <p>
          You choose in the bar at the bottom of the page the first time you
          visit, and you can change your mind any time through <em>Cookie
          choices</em> in the footer. Choosing <em>Only necessary</em> changes
          nothing about how the shop works for you.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Delete your account yourself under Account, or ask us to. Your name,
          email, sign-in, saved addresses, bag and wishlist go at once. Orders
          and invoices are business records and stay for one year after that,
          as the law requires; then the phone number and street on them are
          removed too.
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

      <Section title="Grievance officer">
        <p>
          {BUSINESS.grievance
            ? <>Questions or complaints about your data go to {BUSINESS.grievance.name}, {BUSINESS.grievance.designation}: <a href={`mailto:${BUSINESS.grievance.email}`} className="text-brand-ink hover:underline">{BUSINESS.grievance.email}</a>.</>
            : <>Questions or complaints about your data go to <a href={`mailto:${BUSINESS.email}`} className="text-brand-ink hover:underline">{BUSINESS.email}</a>.</>}{' '}
          Acknowledged within 48 hours, answered within one month. You may also raise it with the Data Protection Board of India under the Digital Personal Data Protection Act, 2023.
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
