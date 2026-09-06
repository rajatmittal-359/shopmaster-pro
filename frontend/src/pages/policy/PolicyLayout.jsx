import { Link } from 'react-router-dom';
import Seo from '../../components/common/Seo';
import { BUSINESS, POLICY_PAGES } from '../../config/policy';

/**
 * The frame every policy page shares.
 *
 * WHY THESE PAGES EXIST AT ALL
 *   Razorpay's website check requires a shipping policy, contact details,
 *   pricing, terms, a privacy policy and a cancellation/refund policy before an
 *   account is considered compliant - and it re-checks. Google Merchant Center
 *   asks for the same set before it will list products for free. The shop had
 *   none of them while already taking live payments.
 *
 *   They are also the plainest thing a stranger looks for before paying a shop
 *   they have never heard of: who is this, and what happens if it goes wrong.
 *
 * Every one of them is indexable on purpose - a checker that cannot read the
 * page counts it as missing.
 */
export default function PolicyLayout({ title, description, path, updated, children }) {
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Seo appends the site name itself; adding it here made every policy
          title read "Contact us | ShopMaster Pro | ShopMaster Pro". */}
      <Seo title={title} description={description} path={path} />

      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="brand-mark font-bold text-lg tracking-tight">
            {BUSINESS.tradeName}
          </Link>
          <Link to="/shop" className="text-sm text-brand-ink font-medium">
            Back to the shop
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
          <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
          {updated && (
            <p className="text-xs text-gray-500 mt-1">Last updated {updated}</p>
          )}

          {/*
            Policy text is read, not skimmed, so it gets a real reading measure
            and generous line height rather than the app's dense UI type.
          */}
          <div className="mt-6 space-y-5 text-[15px] leading-7 text-gray-700">
            {children}
          </div>
        </div>

        <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600">
          {POLICY_PAGES.filter(([, to]) => to !== path).map(([label, to]) => (
            <Link key={to} to={to} className="hover:text-brand-ink">
              {label}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}

/** A heading inside a policy page. */
export function Section({ title, children }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-900 mb-2">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
