'use client';

import { Suspense, useCallback, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Tabs for a long panel page (15 Sep 2026).
 *
 * The URL carries the tab (`?tab=google`), so a link from a mail, the
 * assistant or a notification lands on the right part of the page and the
 * back button works. On a phone the row scrolls sideways as pills; on a
 * desktop it is an underline row. Counts sit on the tab, like Seller
 * Central's "Unfulfilled (3)".
 *
 * A tab may list `anchors` - element ids that live inside it - so an old
 * link with a hash (`/seller/settings#web`) opens the right tab and then
 * scrolls to the element. The hash is kept on the URL when a tab changes.
 *
 * @param {{tabs: Array<{key:string, label:string, count?:number|string, anchors?:string[]}>, defaultTab?:string, children:(key:string)=>any}} props
 */
function TabsInner({ tabs, defaultTab, children, param = 'tab' }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const current = tabs.some((t) => t.key === search.get(param)) ? search.get(param) : defaultTab || tabs[0].key;

  const select = useCallback(
    (key) => {
      const next = new URLSearchParams(search.toString());
      if (key === (defaultTab || tabs[0].key)) next.delete(param);
      else next.set(param, key);
      const qs = next.toString();
      // The hash travels only with the tab that owns it.
      const raw = typeof window === 'undefined' ? '' : window.location.hash;
      const hash = tabs.some((t) => t.key === key && (t.anchors || []).includes(raw.slice(1))) ? raw : '';
      router.replace(`${pathname}${qs ? `?${qs}` : ''}${hash}`, { scroll: false });
    },
    [router, pathname, search, param, defaultTab, tabs]
  );

  // A hash that belongs to another tab: switch, then reveal and scroll once
  // that tab has rendered. Only when the URL does not already name a tab.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const owner = tabs.find((t) => (t.anchors || []).includes(id));
    if (owner && owner.key !== current && !search.get(param)) {
      select(owner.key);
      return;
    }
    const timer = setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      window.dispatchEvent(new CustomEvent('smp:reveal', { detail: id }));
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => clearTimeout(timer);
  }, [current, tabs, search, param, select]);

  return (
    <div>
      <div role="tablist" aria-label="Sections" className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => {
          const active = t.key === current;
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`tab-${t.key}`}
              onClick={() => select(t.key)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${active ? 'border-brand-ink font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
              {t.count !== undefined && t.count !== null && t.count !== 0 && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums ${active ? 'bg-brand-ink/10 text-brand-ink' : 'bg-muted text-muted-foreground'}`}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>
      <div id={`tab-${current}`} role="tabpanel" className="pt-6">
        {children(current)}
      </div>
    </div>
  );
}

/** useSearchParams needs a Suspense boundary for `next build`; callers should not have to remember that. */
export default function PanelTabs(props) {
  return (
    <Suspense fallback={<div className="h-10 border-b" aria-hidden />}>
      <TabsInner {...props} />
    </Suspense>
  );
}
