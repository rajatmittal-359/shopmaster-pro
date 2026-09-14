'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import PanelCard from '@/components/panel/PanelCard';
import { useT } from '@/lib/i18n';
import { usePush } from '@/lib/push';

/**
 * "Turn on notifications" (plan 2.26).
 *
 * Reference: Meesho Supplier and Shopify both ask once, on Home, in one
 * sentence with one button, and never nag again. So:
 *   compact  - one row on the seller Home, shown only while OFF (dismissable
 *              for a week); gone once ON
 *   full     - the card on Settings: state, test button, turn off
 */
const DISMISS_KEY = 'smp.push.dismissedUntil';

export default function PushToggle({ compact = false }) {
  const t = useT();
  const { state, busy, error, enable, disable, test } = usePush();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // localStorage is a browser-only external system; read it after paint.
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      if (!compact) return setDismissed(false);
      let until = 0;
      try {
        until = Number(localStorage.getItem(DISMISS_KEY) || 0);
      } catch {
        /* private mode */
      }
      setDismissed(until > Date.now());
    });
    return () => {
      cancelled = true;
    };
  }, [compact]);

  const onEnable = async () => {
    const ok = await enable();
    if (ok) toast.success(t('Notifications are on. A test is on its way.'));
    if (ok) test();
  };
  const onTest = async () => {
    const ok = await test();
    if (ok) toast.success(t('Sent. Look at your notification bar.'));
  };
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 3600 * 1000));
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  if (state === 'checking') return null;
  if (compact && (dismissed || state === 'on' || state === 'unsupported')) return null;

  const copy = {
    off: { icon: Bell, title: t('Get a buzz when an order comes in'), lead: t('New order · return · dispute - on this phone the same second. No app.') },
    on: { icon: BellRing, title: t('Notifications are on for this device'), lead: t('Orders, returns and disputes reach this phone. Email stays as the copy.') },
    denied: { icon: BellOff, title: t('Notifications are blocked in this browser'), lead: t('Lock icon next to the address → Site settings → Notifications → Allow → reload.') },
    'ios-install': { icon: Bell, title: t('On iPhone, first add ShopMaster to the Home Screen'), lead: t('Safari → Share → Add to Home Screen → open from there → come back here.') },
    unsupported: { icon: BellOff, title: t('This browser cannot show notifications'), lead: t('Open the panel in Chrome on your phone to get them.') },
  }[state] || {};
  const Icon = copy.icon || Bell;

  const actions = (
    <div className="flex flex-wrap gap-2">
      {state === 'off' && <Button size="sm" disabled={busy} onClick={onEnable}>{t('Turn on notifications')}</Button>}
      {state === 'on' && (
        <>
          <Button size="sm" variant="outline" disabled={busy} onClick={onTest}>{t('Send a test')}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={disable}>{t('Turn off on this device')}</Button>
        </>
      )}
      {compact && <Button size="sm" variant="ghost" onClick={dismiss}>{t('Not now')}</Button>}
    </div>
  );

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-ink/30 bg-brand-ink/5 px-4 py-3 text-sm">
        <Icon className="h-5 w-5 shrink-0 text-brand-ink" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{copy.title}</p>
          <p className="text-muted-foreground">{copy.lead}</p>
          {error && <p className="mt-1 text-destructive">{error}</p>}
        </div>
        {actions}
      </div>
    );
  }

  return (
    <PanelCard title={t('Phone notifications')} lead={copy.lead}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-brand-ink" aria-hidden />
        {copy.title}
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-3">{actions}</div>
    </PanelCard>
  );
}
