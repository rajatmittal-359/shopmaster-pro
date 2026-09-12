'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from 'lucide-react';

/**
 * The list of links inside a panel sidebar.
 *
 * WHY THIS IS THE ONLY CLIENT PART
 *   All it needs the browser for is knowing which page it is on. The shell
 *   around it, the headings and the page itself all stay server components.
 *
 * WHY THE ACTIVE STATE MATTERS MORE THAN IT SOUNDS
 *   The panels used to be a row of tabs with NO active state at all - six links
 *   that looked identical whichever page you were on. "Where am I" is the first
 *   question navigation has to answer, and it was the one thing this navigation
 *   could not do.
 *
 * WHY `end` EXISTS
 *   /seller is the dashboard AND the prefix of every other seller page. Without
 *   an exact match on that one, "Dashboard" stays lit on all six.
 */
export default function PanelNav({ groups, onNavigate = null }) {
  const pathname = usePathname();

  const isActive = (href, end) => (end ? pathname === href : pathname.startsWith(href));

  return (
    <nav className="space-y-6">
      {groups.map((group) => (
        <div key={group.label || 'main'}>
          {group.label && (
            <p className="mb-1.5 px-3 text-[0.7rem] font-medium tracking-wider text-muted-foreground uppercase">
              {group.label}
            </p>
          )}

          <ul className="space-y-0.5">
            {group.items.map(({ href, label, icon, end }) => {
              const Icon = Icons[icon] || Icons.Circle;
              const active = isActive(href, end);

              return (
                <li key={href}>
                  <Link
                    href={href}
                    data-tour={href}
                    onClick={onNavigate || undefined}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                      active
                        ? 'bg-primary/10 font-medium text-brand-ink'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    <Icon className="size-4 shrink-0" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
