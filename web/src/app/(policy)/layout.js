/**
 * The frame the six policy pages share.
 *
 * WHY THESE PAGES EXIST AT ALL
 *   Razorpay's website check requires a shipping policy, contact details,
 *   pricing, terms, a privacy policy and a cancellation/refund policy before an
 *   account is treated as compliant - and it re-checks. Google Merchant Center
 *   asks for the same set before it lists products for free.
 *
 * Nothing here is interactive, so every one of them is a static server
 * component: no JavaScript ships for them at all, and a checker that cannot
 * read a page counts it as missing.
 */
export default function PolicyLayout({ children }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <article className="rounded-xl border border-border bg-card p-6 sm:p-8">
        {/*
          A reading measure and generous leading, not the app's dense UI type -
          these are read start to finish, and the prose classes here are applied
          to the whole document rather than repeated on every paragraph.
        */}
        <div className="space-y-5 text-[15px] leading-7 text-muted-foreground [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-foreground [&_strong]:text-foreground">
          {children}
        </div>
      </article>
    </div>
  );
}
