'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from 'lucide-react';
import { authedFetch } from '@/lib/client';

/**
 * The list of links inside a panel sidebar.
 *
 * WHAT IT DOES THAT A LIST OF LINKS DOES NOT (13 Sep 2026, after Shopify's
 * 2023 admin, Linear and Stripe were looked at side by side)
 *   - Groups with small headings: the eye finds "Money" before it finds
 *     "Payments".
 *   - Count badges: Orders 2, Returns & issues 4 - the number the person
 *     came for, before they click. Shopify puts them on Orders; Meesho's
 *     panel on Returns. Fetched from `countsUrl` every minute, quietly.
 *   - Sub-items under the item you are in (Products → All · Photo studio ·
 *     Stock history) instead of a second tab bar inside the page.
 *   - Settings pinned at the bottom, like Shopify's, so the working list
 *     above stays about work.
 *   - The active item carries a left accent bar as well as the tint: two
 *     signals read faster than one, and the bar survives a colour-blind eye.
 *
 * WHY `end` EXISTS
 *   /seller is the dashboard AND the prefix of every other seller page. Without
 *   an exact match on that one, "Home" stays lit everywhere.
 */
export default function PanelNav({ groups, onNavigate = null, countsUrl = null }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState({});

  useEffect(() => {
    if (!countsUrl) return undefined;
    let cancelled = false;
    const load = () =>
      authedFetch(countsUrl)
        .then((d) => {
          if (!cancelled) setCounts(d || {});
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [countsUrl, pathname]);

  const isActive = (href, end) => (end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  const renderItem = ({ href, label, icon, end, badge, children }) => {
    const Icon = Icons[icon] || Icons.Circle;
    const active = isActive(href, end);
    const count = badge ? counts[badge] : 0;
    return (
      <li key={href}>
        <Link
          href={href}
          data-tour={href}
          onClick={onNavigate || undefined}
          aria-current={active ? 'page' : undefined}
          className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
            active ? 'bg-primary/10 font-medium text-brand-ink' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
        >
          {active && <span aria-hidden className="absolute top-1.5 bottom-1.5 -left-2 w-0.5 rounded-full bg-brand-ink" />}
          <Icon className={`size-4 shrink-0 ${active ? '' : 'opacity-80 group-hover:opacity-100'}`} />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {count > 0 && (
            <span
              className="rounded-full bg-brand-ink px-1.5 py-0.5 text-[0.65rem] leading-none font-semibold text-white tabular-nums"
              aria-label={`${count} waiting`}
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Link>
        {children && active && (
          <ul className="mt-0.5 mb-1 ml-[1.35rem] space-y-0.5 border-l pl-3">
            {children.map((child) => {
              const childActive = isActive(child.href, child.end);
              return (
                <li key={child.href}>
                  <Link
                    href={child.href}
                    onClick={onNavigate || undefined}
                    aria-current={childActive ? 'page' : undefined}
                    className={`block rounded-md px-2 py-1.5 text-[0.8rem] transition ${
                      childActive ? 'font-medium text-brand-ink' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {child.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  };

  const main = groups.filter((g) => !g.pinned);
  const pinned = groups.filter((g) => g.pinned);

  const renderGroup = (group) => (
    <div key={group.label || 'main'}>
      {group.label && (
        <p className="mb-1.5 px-3 text-[0.68rem] font-semibold tracking-[0.12em] text-muted-foreground/80 uppercase">{group.label}</p>
      )}
      <ul className="space-y-0.5">{group.items.map(renderItem)}</ul>
    </div>
  );

  return (
    <nav className="flex min-h-full flex-col gap-6" aria-label="Panel">
      {main.map(renderGroup)}
      {pinned.length > 0 && <div className="mt-auto space-y-6 border-t pt-4">{pinned.map(renderGroup)}</div>}
    </nav>
  );
}
