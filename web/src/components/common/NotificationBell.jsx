'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Check } from 'lucide-react';
import { authedFetch } from '@/lib/client';
import { useSession } from '@/lib/session';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * The bell (plan 2.30).
 *
 * Reference: the notification panel every admin tool converges on
 * (Shopify admin, monday.com, Amazon Seller Central): a bell with an
 * unread count, a list newest-first grouped by day, one quiet unread dot
 * per row, tap = go there and mark read, "Mark all read", an honest empty
 * state. No separate page - the panel is the page.
 *
 * `role` follows the panel the header is in, so an account that both buys
 * and sells sees its customer lines in the storefront and its seller lines
 * in the seller panel. The count refreshes every 60 s and whenever the tab
 * comes back into focus - the two moments a person actually looks.
 */
const roleFor = (pathname) => (pathname.startsWith('/admin') ? 'admin' : pathname.startsWith('/seller') ? 'seller' : 'customer');

const dayLabel = (iso, t) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return t('Today');
  if (same(d, y)) return t('Yesterday');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
const timeLabel = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export default function NotificationBell() {
  const { signedIn } = useSession();
  const pathname = usePathname() || '/';
  const role = roleFor(pathname);
  const router = useRouter();
  const t = useT();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const refreshCount = useCallback(() => {
    if (!signedIn) return;
    authedFetch(`/notifications/unread-count?role=${role}`)
      .then((d) => setUnread(d.unread || 0))
      .catch(() => {});
  }, [signedIn, role]);

  useEffect(() => {
    if (!signedIn) return undefined;
    // Ask after paint; then every minute and whenever the tab comes back.
    const first = setTimeout(refreshCount, 300);
    timer.current = setInterval(refreshCount, 60_000);
    const onFocus = () => refreshCount();
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(timer.current);
      window.removeEventListener('focus', onFocus);
    };
  }, [signedIn, refreshCount]);

  const load = useCallback(
    async (before = null) => {
      setBusy(true);
      try {
        const d = await authedFetch(`/notifications?role=${role}&limit=15${before ? `&before=${encodeURIComponent(before)}` : ''}`);
        setItems((prev) => (before && prev ? [...prev, ...d.items] : d.items));
        setMore(Boolean(d.more));
        setUnread(d.unread || 0);
      } catch {
        setItems((prev) => prev || []);
      } finally {
        setBusy(false);
      }
    },
    [role]
  );

  const onOpenChange = (v) => {
    setOpen(v);
    if (v) load();
  };

  const openItem = async (n) => {
    setOpen(false);
    if (!n.readAt) {
      setItems((prev) => (prev || []).map((x) => (x._id === n._id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      authedFetch(`/notifications/${n._id}/read`, { method: 'PATCH' }).catch(() => {});
    }
    router.push(n.url || '/');
  };

  const readAll = async () => {
    setItems((prev) => (prev || []).map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
    setUnread(0);
    await authedFetch(`/notifications/read-all?role=${role}`, { method: 'POST' }).catch(() => {});
  };

  if (!signedIn) return null;

  const groups = [];
  for (const n of items || []) {
    const label = dayLabel(n.createdAt, t);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(n);
    else groups.push({ label, items: [n] });
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        aria-label={unread ? t('{n} new notifications', { n: unread }) : t('Notifications')}
        className="relative inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-ink px-1 text-[0.6rem] font-semibold leading-none text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[22rem] max-w-[calc(100vw-1rem)] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">{t('Notifications')}</p>
          {unread > 0 && (
            <button type="button" onClick={readAll} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Check className="size-3.5" /> {t('Mark all read')}
            </button>
          )}
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {items === null && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('Reading…')}</p>}
          {items && items.length === 0 && (
            <div className="px-3 py-8 text-center">
              <Bell className="mx-auto mb-2 size-6 text-muted-foreground/60" />
              <p className="text-sm font-medium">{t('Nothing yet')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('Orders · returns · disputes · payouts - as they happen.')}</p>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.label}>
              <p className="sticky top-0 bg-popover px-3 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
              <ul>
                {g.items.map((n) => (
                  <li key={n._id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-accent ${n.readAt ? '' : 'bg-brand-ink/5'}`}
                    >
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-brand-ink'}`} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${n.readAt ? '' : 'font-medium'}`}>{n.title}</span>
                        {n.body && <span className="block truncate text-xs text-muted-foreground">{n.body}</span>}
                      </span>
                      <span className="shrink-0 pt-0.5 text-[0.65rem] text-muted-foreground">{timeLabel(n.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {more && (
            <div className="border-t p-2">
              <Button size="sm" variant="ghost" className="w-full" disabled={busy} onClick={() => load(items[items.length - 1].createdAt)}>
                {t('Older')}
              </Button>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
