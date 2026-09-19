import Link from 'next/link';
import PolicyHeading from '@/components/policy/PolicyHeading';
import Section from '@/components/policy/Section';
import { businessFrom } from '@/config/policy';
import { getSettings } from '@/lib/api';

export const metadata = {
  title: 'Compliance',
  description: 'How ShopMaster Pro meets the Consumer Protection (E-Commerce) Rules, including the annual dark-pattern self-audit.',
  alternates: { canonical: '/compliance' },
};

/*
 * The E-Commerce (Amendment) Rules 2026 - in force 1 January 2027 - add three
 * duties for a marketplace on top of the 2020 rules: an annual SELF-AUDIT
 * against the Guidelines for Prevention and Regulation of Dark Patterns 2023
 * with a compliance certificate displayed on the platform; no use of
 * consumer data to promote goods sold under a brand connected to the
 * marketplace without express consent; no bundling of unrelated fees. This
 * page is where the certificate lives and, above it, the checklist the audit
 * walks - one line per named dark pattern, saying what this site does. The
 * checklist is written against the code as it is; when a flow changes, the
 * line for it changes, and the next audit says so.
 *
 * The certificate text comes from admin Settings → Business (year, date,
 * signed by); until it is filled the page says the first audit is due.
 */
const PATTERNS = [
  ['False urgency', 'No countdown timers, no "only 2 left" unless it is the real stock count, no "12 people are viewing this". Sale end dates shown are the ones the seller set.'],
  ['Basket sneaking', 'Nothing is added to the cart or the total except what you chose. Delivery is a separate, visible line; there is no pre-ticked insurance, donation or add-on.'],
  ['Confirm shaming', 'Declining anything - a coupon, notifications, an account - uses neutral words ("Not now"). No guilt copy.'],
  ['Forced action', 'You can browse, search and read every policy without an account. An account is needed only to order, and cash on delivery needs no card.'],
  ['Subscription trap', 'There are no subscriptions. Nothing recurs.'],
  ['Interface interference', 'The primary button is the action you came for; the alternative is visible and works. Prices are shown in one size, taxes included.'],
  ['Bait and switch', 'The price at checkout is the price on the product page at that moment; if a sale ended in between, the checkout stops and says so rather than charging more.'],
  ['Drip pricing', 'The product page price includes taxes. Delivery is shown before you pay, with the option to choose a cheaper speed. No fee appears only on the final screen.'],
  ['Disguised advertisement', 'There is no paid placement, so there is nothing to disguise. See How products are ranked.'],
  ['Nagging', 'A dismissed prompt stays dismissed. Order and account messages are sent because you need them; every other notification - push, digests, tips - has its own switch in your account.'],
  ['Trick question', 'Every choice is worded plainly and positively ("Send me order updates by email"), never as a double negative.'],
  ['SaaS billing', 'Not applicable - nothing is billed on a schedule.'],
  ['Rogue malware', 'No downloads, no pop-unders, no third-party scripts beyond the analytics, sign-in and payment providers named in the privacy policy.'],
];

const ROUTINE = 'Once a year the person named below walks every line above against the live site - as a customer, as a seller and as an administrator - and records anything that no longer holds. Fixes are made before the certificate is signed.';

export default async function CompliancePage() {
  const BUSINESS = businessFrom(await getSettings());
  const audit = BUSINESS.selfAudit;
  const signedOn = audit ? new Date(audit.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <>
      <PolicyHeading title="Compliance" updated="19 September 2026" />

      <Section title="What this page is">
        <p>
          The Consumer Protection (E-Commerce) Rules 2020 and their 2026 amendment ask a
          marketplace to show, in one place, how it deals with the practices the law calls
          dark patterns, and to certify once a year that it has checked itself. This page is
          that place. The other duties - the seller of record on every shop page, the
          grievance officer, the ranking parameters, country of origin - are on their own
          pages and are linked from the footer.
        </p>
      </Section>

      <Section title="Self-audit certificate">
        {audit ? (
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <p>
              <strong>{BUSINESS.legalName}</strong>, operating the marketplace ShopMaster Pro,
              certifies that a self-audit of the platform against the Guidelines for Prevention
              and Regulation of Dark Patterns, 2023 was carried out for the year{' '}
              <strong>{audit.year}</strong>, covering each practice listed on this page, and
              that the platform was found compliant on the date of signing.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Signed on {signedOn} by {audit.by}.
            </p>
          </div>
        ) : (
          <p>
            The first annual self-audit is due before <strong>1 January 2027</strong>, when the
            amended rules take effect. Until it is signed, the checklist below is the
            standing statement of how the site behaves, and every line of it is open to
            challenge through the grievance officer.
          </p>
        )}
        <p className="text-sm text-muted-foreground">{ROUTINE}</p>
      </Section>

      <Section title="The checklist - each named dark pattern, and what this site does">
        <dl className="space-y-3">
          {PATTERNS.map(([name, what]) => (
            <div key={name}>
              <dt className="font-medium text-foreground">{name}</dt>
              <dd className="text-muted-foreground">{what}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Two more duties from the 2026 amendment">
        <p>
          <strong>Consumer data and connected brands.</strong> The platform does not use what
          you browse or buy to promote goods sold under any brand connected to the people who
          run it. Recommendations (&ldquo;similar products&rdquo;) come from the product you are looking
          at, not from who sells it.
        </p>
        <p>
          <strong>No bundled fees.</strong> You pay for the goods and, when it applies, for
          delivery. No fee for an unrelated service is attached to an order.
        </p>
      </Section>

      <Section title="If something here is not true">
        <p>
          Tell the grievance officer -{' '}
          {BUSINESS.grievance ? (
            <>
              {BUSINESS.grievance.name}, {BUSINESS.grievance.designation},{' '}
              <a href={`mailto:${BUSINESS.grievance.email}`} className="underline">
                {BUSINESS.grievance.email}
              </a>
            </>
          ) : (
            <Link href="/contact" className="underline">
              contact details
            </Link>
          )}
          . Complaints are acknowledged within 48 hours and resolved within one month. The
          National Consumer Helpline is 1915.
        </p>
      </Section>
    </>
  );
}
