import PolicyLayout, { Section } from './PolicyLayout';
import { POLICY } from '../../config/policy';

/**
 * Razorpay's website check asks for "pricing details" - meaning it must be
 * plain what a customer pays and in what currency, with nothing added after
 * they have decided.
 */
export default function PricingPage() {
  return (
    <PolicyLayout
      title="Pricing"
      description="What you pay, in what currency, and what is added at checkout."
      path="/pricing"
    >
      <Section title="Currency">
        <p>
          Every price on this site is in <strong>Indian Rupees (INR)</strong>{' '}
          and includes all applicable taxes. We do not sell in other currencies.
        </p>
      </Section>

      <Section title="What the product price covers">
        <p>
          The price shown on a product is the price of that item. Where a
          higher price is shown struck through beside it, that is the
          seller&rsquo;s stated maximum retail price and the saving is the
          difference between the two.
        </p>
      </Section>

      <Section title="Delivery">
        <p>
          Delivery is charged separately by weight and destination and is shown
          at checkout before you pay. It is around &#8377;
          {POLICY.shippingRate} for a typical small parcel within India, and
          some products are marked free delivery.
        </p>
      </Section>

      <Section title="Nothing is added later">
        <p>
          The total on the checkout page is the total you are charged. There are
          no handling charges, no convenience fees and no surcharge for paying
          by any particular method.
        </p>
      </Section>

      <Section title="Prices can change">
        <p>
          Prices and offers can change without notice, but the price you see
          when you place an order is the price you pay for that order.
        </p>
      </Section>

      <Section title="Sellers on this marketplace">
        <p>
          This is a marketplace: some items are sold by Charming Jewels and
          others by independent sellers, and each product page names its seller.
          Prices are set by the seller of that item.
        </p>
      </Section>
    </PolicyLayout>
  );
}
