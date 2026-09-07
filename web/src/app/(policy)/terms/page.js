import Link from 'next/link';
import PolicyHeading from '@/components/policy/PolicyHeading';
import Section from '@/components/policy/Section';
import { POLICY, BUSINESS } from '@/config/policy';

export const metadata = {
  title: 'Terms and conditions',
  description: 'The terms on which Charming Jewels sells through ShopMaster Pro.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <>
      <PolicyHeading title="Terms and conditions" updated="6 September 2026" />

      <p>
        These terms apply to everyone who uses this site, and using it means
        accepting them. They are written plainly on purpose.
      </p>

      <Section title="Who you are buying from">
        <p>
          {BUSINESS.tradeName} is a marketplace operated by {BUSINESS.legalName},{' '}
          {BUSINESS.addressLines.join(', ')}. Some items are sold by us and others
          by independent sellers. Every product page names its seller, and your
          contract for that item is with them.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          You are responsible for what happens under your account, so keep your
          password to yourself and tell us if you think someone else has it. The
          details you give us &mdash; particularly the delivery address and phone
          number &mdash; must be accurate, because a courier cannot deliver to an
          address that does not exist.
        </p>
      </Section>

      <Section title="Orders">
        <p>
          An order is an offer to buy, and it is accepted when we confirm it by
          email. We may decline an order and refund it in full if the item is out
          of stock, if the price was listed wrongly, or if we cannot deliver to
          the address given.
        </p>
      </Section>

      <Section title="Prices and payment">
        <p>
          Prices are in Indian Rupees and include applicable taxes. Payment is
          taken through Razorpay; we never see or store your card details. Cash on
          delivery, where offered, is paid to the delivery agent.
        </p>
      </Section>

      <Section title="Delivery, cancellation and returns">
        <p>
          Delivery is covered by our{' '}
          <Link href="/shipping-policy" className="text-brand-ink hover:underline">
            shipping policy
          </Link>
          . You may cancel before dispatch, and return within {POLICY.returnDays}{' '}
          days of delivery, on the terms set out in the{' '}
          <Link href="/refund-policy" className="text-brand-ink hover:underline">
            cancellations, returns and refunds policy
          </Link>
          .
        </p>
      </Section>

      <Section title="Product photographs">
        <p>
          We photograph our jewellery as honestly as we can, but colour varies
          between screens, and handmade and artificial jewellery varies slightly
          from piece to piece. That variation is not a defect. If an item is not
          what the page described, that is a return and we will treat it as one.
        </p>
      </Section>

      <Section title="Reviews and what you post">
        <p>
          Write honestly. We remove reviews that are abusive, that contain someone
          else&rsquo;s personal details, or that are not about the product.
        </p>
      </Section>

      <Section title="What we are responsible for">
        <p>
          We are responsible for supplying goods as described, and for putting
          right what we get wrong. We are not responsible for delays caused by
          couriers, weather or other events outside our control &mdash; though we
          will always tell you what has happened.
        </p>
      </Section>

      <Section title="Governing law">
        <p>
          These terms are governed by the laws of India, and the courts at Jaipur,
          Rajasthan have jurisdiction over any dispute.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms. The version on this page when you place an
          order is the one that applies to that order.
        </p>
      </Section>
    </>
  );
}
