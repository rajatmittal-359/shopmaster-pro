'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * A card that folds (15 Sep 2026).
 *
 * The panel's answer to long pages: every section keeps its title and a
 * one-line SUMMARY in the header, so a folded page still reads at a glance
 * ("3 photos ✓ · ₹450 · 5 in stock"); the chevron opens the detail. Open by
 * default unless `defaultOpen` is false (done or optional sections); the
 * person's choice is remembered per `id` in localStorage, so a seller who
 * likes everything open keeps it that way.
 *
 * Reference: Shopify's product page folds "Search engine listing" behind
 * Edit and shows the status in the header; Linear's collapsible groups
 * carry counts. NN/g: progressive disclosure - summary first, detail on
 * demand - and on phones an accordion halves the perceived length.
 */
const KEY = (id) => `smp.fold.${id}`;

/**
 * `remember` (26 Sep 2026): whether this card's open/closed choice survives.
 *
 * On by default, which is right for a page you return to. It is turned OFF
 * for the NEW-product form: Rajat, after using it - "matlab new product add
 * karte time har time band mile". Every new listing should start the same
 * way, all shut, whatever the seller happened to open while filling the last
 * one. Editing an existing product is the opposite case and keeps the memory.
 */
export default function Fold({ id, title, summary, lead, badge, defaultOpen = true, foldOnPhone = false, remember = true, aside, children, className = '' }) {
  const [open, setOpen] = useState(defaultOpen);
  const [ready, setReady] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const saved = remember ? localStorage.getItem(KEY(id)) : null;
        if (saved === '1') setOpen(true);
        else if (saved === '0') setOpen(false);
        // On a phone, sections after the first two start folded with their
        // summary (Baymard: an accordion halves a mobile form's perceived
        // length); a saved choice or a jump link still opens them.
        else if (foldOnPhone && window.matchMedia('(max-width: 639px)').matches) setOpen(false);
      } catch {
        /* private mode */
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id, foldOnPhone, remember]);

  // A jump link (the score panel's "fix this") targets a field inside a folded
  // section: open before the page scrolls, or the scroll lands on nothing.
  useEffect(() => {
    const onReveal = (e) => {
      const target = typeof e.detail === 'string' ? document.getElementById(e.detail) : null;
      if (target && ref.current && ref.current.contains(target)) setOpen(true);
    };
    window.addEventListener('smp:reveal', onReveal);
    return () => window.removeEventListener('smp:reveal', onReveal);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!remember) return; // a new-product form forgets on purpose
    try {
      localStorage.setItem(KEY(id), next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  return (
    <section ref={ref} id={id} className={`rounded-xl border bg-card scroll-mt-20 ${className}`} data-open={open}>
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <ChevronDown className={`mt-1 size-4 shrink-0 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">{title}</span>
              {badge}
            </span>
            {!open && summary && <span className="mt-0.5 block truncate text-sm text-muted-foreground">{summary}</span>}
            {open && lead && <span className="mt-1 block text-sm text-muted-foreground">{lead}</span>}
          </span>
        </button>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      <div id={`${id}-body`} hidden={!open} className={`px-4 pb-5 sm:px-5 ${ready ? '' : ''}`}>
        <div className="space-y-5">{children}</div>
      </div>
    </section>
  );
}
