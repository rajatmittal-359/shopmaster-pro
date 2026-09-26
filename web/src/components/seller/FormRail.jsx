'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

/**
 * The form's own rail: where you are, what is left, and one tap to any of it.
 *
 * WHY THIS AND NOT A STEPPER OR TABS (26 Sep 2026)
 *   Rajat asked to see the product form as a stepper ("step 1 to step 7,8") or
 *   as tabs, and was open to something better. Three references answered, and
 *   they agreed against both:
 *
 *   - **Shopify admin**, the merchant tool everyone benchmarks, uses ONE
 *     scrolling page of always-open sections with a single Save. Every edit in
 *     their own help pages is "go to the product, change the section, Save" -
 *     no step to walk, no tab to hunt. Only the optional "Search engine
 *     listing" is folded.
 *   - **Amazon Seller Central** is the tabbed pole (Vital Info · Offer ·
 *     Images · Description · Keywords). The cost is structural: a validation
 *     error on a tab you are not looking at is invisible, and our listing
 *     score reads across every section at once, so tabs would hide the very
 *     thing the score is pointing at.
 *   - **Material Design archived the Stepper.** It survives only on
 *     m1.material.io and is absent from the current spec - Android's own
 *     system stopped recommending the pattern. That matters because Mummy
 *     fills this form on a phone.
 *
 *   And a stepper breaks the half of the job nobody demos: EDIT. Add and edit
 *   are one component here. Walking seven steps to change a price is the
 *   wrong shape for the thing sellers actually do most often.
 *
 *   What a stepper and tabs genuinely give is ORIENTATION - how much is left,
 *   and a way to jump. This rail gives both and hides nothing: the sections
 *   stay on one page, in order, open. On a phone it is a horizontally
 *   scrolling row of chips, which is a pattern Material does still endorse
 *   (scrollable tabs) and which needs no precision tapping.
 *
 *   The tick is not decoration: it is the same "is this filled" question the
 *   listing score asks, so the rail and the score can never disagree.
 */
export default function FormRail({ sections }) {
  const [active, setActive] = useState(sections[0]?.id);

  /*
   * A click wins until the smooth scroll has finished. Without this the
   * scroll handler fires all the way down and overwrites the chip you just
   * pressed with whatever it passes on the journey.
   */
  const locked = useRef(false);
  const lockTimer = useRef(null);

  /*
   * Which section is being read: the LAST one whose top has gone under the
   * rail. Not "the one filling most of the screen" - that was the first
   * attempt and Rajat found the bug in a minute: Details is a tall card and
   * Questions is a short one, so Details kept winning the area contest even
   * after you had scrolled past it, and the short sections at the end could
   * never light up at all.
   *
   * The bottom of the page needs its own answer for the same reason: once the
   * page cannot scroll any further, the last cards never reach the line, so
   * the last section is simply declared the active one.
   */
  const pick = useCallback(() => {
    if (locked.current) return;
    const LINE = 132; // just below the sticky rail

    let current = sections[0]?.id;
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el && el.getBoundingClientRect().top <= LINE) current = s.id;
    }

    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
    if (atBottom) {
      const last = [...sections].reverse().find((s) => document.getElementById(s.id));
      if (last) current = last.id;
    }

    if (current) setActive(current);
  }, [sections]);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        pick();
      });
    };
    pick();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (lockTimer.current) clearTimeout(lockTimer.current);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [pick]);

  const jump = (id) => {
    // Light the chip at once - the person pressed it, so it is active now,
    // whatever the scroll is about to pass over on the way there.
    setActive(id);
    locked.current = true;
    if (lockTimer.current) clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => {
      locked.current = false;
    }, 900);

    // The card may be folded (phones fold the later ones). Fold listens for
    // this and opens itself, otherwise the scroll lands on a closed header.
    window.dispatchEvent(new CustomEvent('smp:reveal', { detail: id }));
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  /*
   * A section with `done: undefined` is a READ-OUT, not something to fill -
   * section 8 "Google" is the preview, the suggestions and Google's own
   * verdicts. It gets no tick and is left out of the count.
   *
   * Rajat caught this (26 Sep 2026): the Google chip was showing a tick in
   * edit mode because I had wired it to `tags` - and tags are edited in
   * section 6 "Details", not in Google. Nothing was hidden or lost; the chip
   * was reporting on a field that lives somewhere else.
   */
  const counted = sections.filter((s) => s.done !== undefined);
  const done = counted.filter((s) => s.done).length;

  return (
    <nav
      aria-label="Sections of this listing"
      className="sticky top-14 z-20 -mx-4 border-b bg-background/85 px-4 py-2 backdrop-blur-lg backdrop-saturate-150 sm:-mx-5 sm:px-5"
    >
      <div className="flex items-center gap-2">
        <ul className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sections.map((s) => {
            const on = active === s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => jump(s.id)}
                  aria-current={on ? 'true' : undefined}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    on
                      ? 'bg-primary text-primary-foreground'
                      : s.done
                        ? 'bg-muted text-foreground hover:bg-muted/80'
                        : 'text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  {s.done && <Check className={`size-3 ${on ? '' : 'text-emerald-600 dark:text-emerald-400'}`} aria-hidden />}
                  {s.label}
                </button>
              </li>
            );
          })}
        </ul>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {done}/{counted.length}
        </span>
      </div>
    </nav>
  );
}
