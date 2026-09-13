'use client';

import { useEffect, useState } from 'react';
import { Sparkles, X, Minus, ChevronUp } from 'lucide-react';
import AskPanel from '@/components/assist/AskPanel';
import { useDock, setDock } from '@/lib/assistDock';
import { useT } from '@/lib/i18n';

/**
 * Ask ShopMaster, docked (plan 2.33).
 *
 * WHY
 *   The assistant says "open /seller/orders and press Book courier" - the
 *   person taps the link, the page changes, and the answer with its steps
 *   is gone. Rajat, 14 Sep: "context kya dekhega ... AI ka response side me
 *   dikhe jisse uske batae steps kare." Shopify's Sidekick and Intercom's
 *   messenger solve it the same way: the conversation is a drawer beside
 *   the page, not a page of its own, and it stays while the person works.
 *
 * HOW
 *   Mounted once in PanelShell (the layout), so client navigation never
 *   unmounts it; the thread is kept in sessionStorage as well, so a reload
 *   keeps it too. Desktop: a fixed right-hand column, the page stays
 *   clickable (no overlay). Phone: a bottom sheet that minimises to one
 *   line - the last answer's first line - so the steps stay readable while
 *   the person taps through the page.
 */
export default function AssistDrawer({ role }) {
  const dock = useDock();
  const t = useT();
  const [lastLine, setLastLine] = useState('');

  // The one-line bar shows the last answer's first sentence.
  useEffect(() => {
    if (dock !== 'min') return undefined;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const saved = JSON.parse(sessionStorage.getItem(`smp.assist.${role}`) || '[]');
        const last = [...saved].reverse().find((m) => m.role === 'assistant' && m.text);
        setLastLine(last ? String(last.text).split('\n')[0].slice(0, 120) : '');
      } catch {
        setLastLine('');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dock, role]);

  // Esc closes, like every drawer.
  useEffect(() => {
    if (dock !== 'open') return undefined;
    const onKey = (e) => e.key === 'Escape' && setDock('min');
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dock]);

  if (dock === 'closed') return null;

  if (dock === 'min') {
    return (
      <button
        type="button"
        onClick={() => setDock('open')}
        className="fixed bottom-16 left-3 right-3 z-40 flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-left text-sm shadow-lg lg:bottom-4 lg:left-auto lg:right-4 lg:max-w-sm"
        aria-label={t('Open Ask ShopMaster')}
      >
        <Sparkles className="size-4 shrink-0 text-brand-from" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{lastLine || t('Ask ShopMaster')}</span>
        <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    );
  }

  return (
    <aside
      role="complementary"
      aria-label={t('Ask ShopMaster')}
      className="fixed inset-x-0 bottom-0 z-40 flex h-[72dvh] flex-col rounded-t-2xl border bg-card shadow-2xl lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-20 lg:h-auto lg:w-[26rem] lg:rounded-2xl"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Sparkles className="size-4 text-brand-from" aria-hidden />
        <span className="flex-1 text-sm font-semibold">{t('Ask ShopMaster')}</span>
        <button type="button" onClick={() => setDock('min')} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t('Minimise - keep the answer in view')}>
          <Minus className="size-4" />
        </button>
        <button type="button" onClick={() => setDock('closed')} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t('Close')}>
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <AskPanel role={role} fill persistKey={`smp.assist.${role}`} />
      </div>
    </aside>
  );
}
