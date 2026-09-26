'use client';

import { CheckCircle2, Clock, CircleAlert, CircleHelp, ExternalLink } from 'lucide-react';
import { useT } from '@/lib/i18n';

/**
 * What Google has done with one listing, in a form a person can read.
 *
 * WHY IT WAS REWRITTEN (27 Sep 2026)
 *   The first version printed this, as a paragraph, inside the edit form:
 *
 *     Indexed:
 *     not yet · URL is unknown to Google. Google finds new pages within a few
 *     weeks; a complete listing is indexed sooner.
 *     Google Shopping:  not in feed
 *     Not shown in any Google search in the last 28 days.
 *
 *   Rajat: "ye sab text noisy sa feel hota hai, kuch samajh nahi aata, aisa
 *   lagta hai faltu keede makode chal rahe hain, padhne ka man nahi karta."
 *   He is right and the diagnosis is specific, not taste: the LABEL and its
 *   ANSWER were on different lines, so nothing lined up; the answer and the
 *   explanation were glued into one sentence, so there was no short answer to
 *   find; and the last line had no label at all. It was three questions
 *   answered in a paragraph.
 *
 * THE SHAPE, FROM GOOGLE'S OWN TOOLS
 *   Search Console's URL Inspection answers in exactly three parts: an icon,
 *   a verdict in three or four words ("URL is not on Google"), then one line
 *   of plain explanation underneath. Merchant Center's product page does the
 *   same with a status chip. So: one row per question, the answer first and
 *   in colour, the sentence second and small. Three rows, each readable in
 *   about a second, and nothing to read at all when everything is fine.
 */
const TONE = {
  good: { icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400' },
  wait: { icon: Clock, cls: 'text-amber-600 dark:text-amber-400' },
  bad: { icon: CircleAlert, cls: 'text-destructive' },
  unknown: { icon: CircleHelp, cls: 'text-muted-foreground' },
};

function Row({ label, tone, answer, note }) {
  const { icon: Icon, cls } = TONE[tone] || TONE.unknown;
  return (
    <div className="flex gap-3 py-3">
      <Icon className={`mt-0.5 size-5 shrink-0 ${cls}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`text-sm font-semibold ${cls}`}>{answer}</p>
        {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      </div>
    </div>
  );
}

const onDay = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export default function GoogleStatus({ google }) {
  const t = useT();
  if (!google) return null;

  const { index, merchant, shopping, queries = [] } = google;

  // 1 · Is it on Google at all?
  const search =
    index.indexed === true
      ? { tone: 'good', answer: t('On Google'), note: index.lastCrawl ? t('Last checked {d}.', { d: onDay(index.lastCrawl) }) : null }
      : index.indexed === false
        ? { tone: 'wait', answer: t('Not on Google yet'), note: t('Google has not reached this page. A complete listing gets there sooner.') }
        : { tone: 'unknown', answer: t('Not known'), note: index.reason ? t('We could not ask Google: {r}.', { r: index.reason }) : null };

  // 2 · Is it allowed into Google Shopping?
  const shop = {
    approved: { tone: 'good', answer: t('Approved') },
    disapproved: { tone: 'bad', answer: t('Rejected'), note: t('Fix the problems below and Google checks it again.') },
    pending: { tone: 'wait', answer: t('Being checked'), note: t('Google usually answers within a few days.') },
    'not in feed': { tone: 'wait', answer: t('Not sent yet'), note: t('It joins the feed once the listing is live and complete.') },
  }[merchant.status] || { tone: 'unknown', answer: t('Not known') };

  if (merchant.status === 'approved') {
    shop.note = shopping
      ? t('Shown {i} times, {c} clicks in 28 days.', { i: shopping.impressions.toLocaleString('en-IN'), c: shopping.clicks })
      : t('No views in Shopping yet.');
  }

  // 3 · What did people type?
  const found =
    queries.length > 0
      ? { tone: 'good', answer: t('{n} searches found it', { n: queries.length }), note: t('In the last 28 days.') }
      : { tone: 'wait', answer: t('No searches yet'), note: t('Nobody reached this page from Google in the last 28 days.') };

  return (
    <div>
      <div className="divide-y">
        <Row label={t('Google search')} {...search} />
        <Row label={t('Google Shopping')} {...shop} />
        <Row label={t('Words people searched')} {...found} />
      </div>

      {merchant.issues?.length > 0 && (
        <ul className="mt-3 space-y-2">
          {merchant.issues.map((i) => (
            <li key={i.code} className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {i.text}
              {i.detail ? ` - ${i.detail}` : ''}{' '}
              {i.help && (
                <a href={i.help} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium underline">
                  {t('how to fix')} <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* The words themselves, because a seller's next search word is usually
          one of these - the same evidence the coach will use (WHAT-IS-LEFT §3). */}
      {queries.length > 0 && (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-1 font-medium">{t('They typed')}</th>
              <th className="pb-1 text-right font-medium">{t('Shown')}</th>
              <th className="pb-1 text-right font-medium">{t('Position')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {queries.slice(0, 8).map((q) => (
              <tr key={q.query}>
                <td className="py-1.5 pr-2">{q.query}</td>
                <td className="py-1.5 text-right tabular-nums">{q.impressions}</td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">{Math.round(q.position)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
