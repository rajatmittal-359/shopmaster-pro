'use client';

import { Suspense, useCallback } from 'react';
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
 * @param {{tabs: Array<{key:string, label:string, count?:number|string}>, defaultTab?:string, children:(key:string)=>any}} props
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
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, pathname, search, param, defaultTab, tabs]
  );

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
