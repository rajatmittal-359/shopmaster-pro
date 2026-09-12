'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Infinity as InfinityIcon, Clock, Ban, CheckCircle2, ShieldCheck } from 'lucide-react';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * AI Studio: every provider and model, what each can do, what is left, and
 * when the rest comes back.
 *
 * WHY THIS PAGE EXISTS
 *   Rajat's requirement, and it is the right one for a product: whoever uses
 *   the AI - the admin, a seller, us - should see the same thing. Which models
 *   are there, which are available now, which have hit a limit (shown, but
 *   disabled, with the limit and the return time), and the freedom to choose
 *   one. A button that just says "Improve" hides all of that, and hidden
 *   limits are what make a feature feel broken when it is only spent.
 *
 * WHAT IS HONEST HERE, AND WHAT IS ESTIMATED
 *   Pollinations reports a live balance - that number is theirs. Everything
 *   else is our own ledger against each provider's published allowance, and a
 *   reset time is marked "estimated" wherever it is our arithmetic rather
 *   than their statement. The card says which.
 *
 * THE TOGGLE
 *   An exempt account (the admin, the platform's own shop) can switch the
 *   seller caps on for itself. Off means unlimited; on means "treat me like
 *   any seller". It is here because this is where the caps are explained.
 */
const QUALITY = {
  best: { label: 'Best', className: 'bg-brand-from/15 text-brand-ink' },
  high: { label: 'High', className: 'bg-primary/10 text-brand-ink' },
  good: { label: 'Good', className: 'bg-muted text-foreground' },
  basic: { label: 'Basic', className: 'bg-muted text-muted-foreground' },
};

const CAN = { edit: 'Edits your photo', generate: 'From words', text: 'Writes text', vision: 'Reads a photo' };

const when = (iso, estimate) => {
  if (!iso) return null;
  const s = new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  return estimate ? `~${s} (est.)` : s;
};

const unitWord = (n, unit) => {
  if (n == null) return '—';
  if (unit === 'usd') return `$${Number(n).toFixed(2)}`;
  if (unit === 'pollen') return `${Number(n).toFixed(3)} pollen`;
  return `${Math.round(n).toLocaleString('en-IN')} ${unit}`;
};

export default function AiStudio({ base = '/seller' }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      setData(await authedFetch(`${base}/ai/catalog`));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    authedFetch(`${base}/ai/catalog`)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [base]);

  const toggleLimits = async () => {
    setBusy(true);
    try {
      const r = await authedFetch(`${base}/ai/limits`, { method: 'PATCH', body: { likeSeller: !data.limitsLikeSeller } });
      setData((d) => ({ ...d, limitsLikeSeller: r.limitsLikeSeller, usage: r.usage }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <p className="text-destructive">{error}</p>;
  if (!data) return <p className="text-muted-foreground">Loading…</p>;

  const { providers, models, usage } = data;
  const exempt = usage.exempt;

  return (
    <div className="space-y-6">
      {/* YOUR ALLOWANCE */}
      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Your allowance today</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {exempt
                ? 'This account is not capped. Use the AI as much as the providers allow.'
                : 'Per account, per day. Resets at midnight IST. The platform-wide premium pool is shared by everyone.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data.canToggleLimits && (
              <Button variant="outline" size="sm" onClick={toggleLimits} disabled={busy}>
                <ShieldCheck className="size-4" />
                {data.limitsLikeSeller ? 'Using seller limits - turn off' : 'Use seller limits on me'}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={load} disabled={busy} aria-label="Refresh">
              <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3 sm:max-w-md">
          {[
            ['Photos', usage.remaining.images, usage.caps?.imagesPerSellerPerDay],
            ['Premium', usage.remaining.premiumImages, usage.caps?.premiumPerSellerPerDay],
            ['Drafts', usage.remaining.texts, usage.caps?.textsPerSellerPerDay],
          ].map(([label, left, cap]) => (
            <div key={label} className="rounded-lg bg-muted/50 p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 flex items-baseline gap-1 text-xl font-semibold">
                {left == null ? <InfinityIcon className="size-5" /> : left}
                {cap != null && <span className="text-xs font-normal text-muted-foreground">/ {cap}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* MODELS */}
      <section>
        <h2 className="font-semibold">Models</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          What each one can do and how many more it can do today. Pick one by name from any photo&rsquo;s Edit
          menu, or leave it on Automatic and the best available answers.
        </p>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {models.map((m) => {
            const q = QUALITY[m.quality] || QUALITY.good;
            return (
              <li
                key={m.id}
                className={`rounded-xl border p-4 ${m.available ? 'bg-card' : 'bg-muted/40 opacity-75'}`}
                data-available={m.available}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {m.label}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${q.className}`}>{q.label}</span>
                      {m.elo && <span className="text-[11px] text-muted-foreground">ELO {m.elo}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{m.providerLabel}</p>
                  </div>
                  {m.available ? (
                    <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
                  ) : (
                    <Ban className="size-5 shrink-0 text-muted-foreground" />
                  )}
                </div>

                <p className="mt-2 text-sm text-muted-foreground">{m.note}</p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.can.map((c) => (
                    <Badge key={c} variant="secondary" className="font-normal">
                      {CAN[c] || c}
                    </Badge>
                  ))}
                </div>

                <p className="mt-3 text-sm">
                  {m.available ? (
                    m.unlimited ? (
                      <span className="text-emerald-700">Unlimited</span>
                    ) : m.remaining != null ? (
                      <span>
                        <strong>{m.remaining}</strong> more today
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Available (remaining unknown)</span>
                    )
                  ) : (
                    <span className="flex items-start gap-1.5 text-muted-foreground">
                      <Clock className="mt-0.5 size-3.5 shrink-0" />
                      {m.reason}
                    </span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* PROVIDERS */}
      <section>
        <h2 className="font-semibold">Providers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The free allowance behind each group of models. &ldquo;Live&rdquo; means the provider reports its own
          balance; otherwise the number is our count against their published limit.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Provider</th>
                <th className="px-3 py-2 font-medium">Allowance</th>
                <th className="px-3 py-2 font-medium">Used</th>
                <th className="px-3 py-2 font-medium">Left</th>
                <th className="px-3 py-2 font-medium">Resets</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(providers).map(([key, p]) => (
                <tr key={key} className="border-t">
                  <td className="px-3 py-2 font-medium">
                    {p.label}
                    <span className="block text-xs font-normal text-muted-foreground">reliability #{p.reliability}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {p.limit == null ? 'Balance (no refill)' : `${unitWord(p.limit, p.unit)} / ${p.period}`}
                  </td>
                  <td className="px-3 py-2">{unitWord(p.used, p.unit)}</td>
                  <td className="px-3 py-2">
                    {unitWord(p.remainingUnits, p.unit)}
                    {p.balanceIsLive && <span className="ml-1 text-[11px] text-emerald-700">live</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{when(p.resetsAt, p.resetIsEstimate) || '—'}</td>
                  <td className="px-3 py-2">
                    {!p.configured ? (
                      <span className="text-muted-foreground">Not set up</span>
                    ) : p.exhausted ? (
                      <span className="text-destructive">Used up</span>
                    ) : (
                      <span className="text-emerald-700">Available</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Checked {new Date(data.at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST. &ldquo;est.&rdquo; marks a
          reset time that is our estimate, not the provider&rsquo;s statement.
        </p>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
