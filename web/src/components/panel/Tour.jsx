'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { authedFetch } from '@/lib/client';
import { useSession } from '@/lib/session';

/**
 * First-visit coach marks - three at most, "Next / Got it", never twice.
 *
 * Shopify shows a new merchant a handful of tooltips on the admin the first
 * time: where orders land, where products live, where the money is. That is
 * the whole idea. Each step points at a real element (by `data-tour`), the
 * page dims behind it, the card says one sentence. Dismissed or finished, it
 * never returns; a role that has not been seen (admin vs seller) gets its own.
 *
 * WHERE "SEEN" IS KEPT (24 Sep 2026)
 *   On the ACCOUNT (`promptsOff`, via /auth/me), not in this browser. It was
 *   localStorage alone, which is the same fault the notification nudge had:
 *   open the panel from a link inside another app, in a private tab, or on a
 *   second phone, and the coach marks start over on a person who has already
 *   done this. localStorage stays as the instant answer while /auth/me is in
 *   flight, so a returning seller does not see a flash of the first step.
 *
 * Steps whose element is not on the current page are skipped, so the tour
 * works from any first page, not only Home.
 */
export default function Tour({ id, steps }) {
  const key = `smp_tour_${id}`;
  const promptKey = `tour_${id}`;
  const { capabilities } = useSession();
  const [index, setIndex] = useState(-1);
  const [box, setBox] = useState(null);

  // Start once, after paint, only if this person has never finished it.
  // `capabilities` is null until /auth/me answers - waiting is the point.
  const seenOnAccount = capabilities ? (capabilities.promptsOff || []).includes(promptKey) : null;
  useEffect(() => {
    if (seenOnAccount !== false) return undefined;
    let seenHere = true;
    try {
      seenHere = localStorage.getItem(key) === '1';
    } catch {}
    if (seenHere) return undefined;
    const t = setTimeout(() => setIndex(0), 600);
    return () => clearTimeout(t);
  }, [key, seenOnAccount]);

  const visible = steps.filter((s) => typeof document !== 'undefined' && document.querySelector(`[data-tour="${s.target}"]`));
  const step = index >= 0 ? visible[index] : null;

  // Measure the target after layout; a resize re-measures. The box is
  // derived state, set from the browser's answer, never synchronously.
  useLayoutEffect(() => {
    if (!step) return undefined;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    el.scrollIntoView({ block: 'nearest' });
    const frame = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [step]);

  const finish = () => {
    try {
      localStorage.setItem(key, '1');
    } catch {}
    // And on the account, so the next browser knows too. A failed save only
    // costs this person the tour once more; it is not worth an error message.
    authedFetch('/auth/prompts/off', { method: 'POST', body: { key: promptKey } }).catch(() => {});
    setBox(null);
    setIndex(-1);
  };
  const advance = () => {
    setBox(null);
    setIndex(index + 1);
  };

  if (!step) return null;
  if (!box) return null;
  const last = index === visible.length - 1;
  const pad = 6;
  const cardTop = box.top + box.height + 12;
  const cardLeft = Math.max(16, Math.min(box.left, window.innerWidth - 336));

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={step.title}>
      {/* Dim everything except the target: one box with a shadow the size of
          the screen, so the hole is the only thing lit. */}
      <div
        className="pointer-events-none absolute rounded-lg ring-2 ring-primary"
        style={{
          top: box.top - pad,
          left: box.left - pad,
          width: box.width + pad * 2,
          height: box.height + pad * 2,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
        }}
        aria-hidden
      />
      <div
        className="absolute w-80 rounded-xl border bg-card p-4 text-sm shadow-lg"
        style={{ top: Math.min(cardTop, window.innerHeight - 180), left: cardLeft }}
      >
        <p className="text-xs text-muted-foreground">
          {index + 1} of {visible.length}
        </p>
        <p className="mt-1 font-semibold">{step.title}</p>
        <p className="mt-1 text-muted-foreground">{step.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={finish} className="text-xs text-muted-foreground hover:text-foreground">
            Skip
          </button>
          <Button size="sm" onClick={() => (last ? finish() : advance())}>
            {last ? 'Got it' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
