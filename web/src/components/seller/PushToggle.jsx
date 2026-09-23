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
 *   compact  - one row on the seller Home, shown only while OFF; gone for good
 *              once the seller says "Not now", and gone once it is ON
 *   full     - the card on Settings: state, test button, turn off
 *
 * WHERE "NOT NOW" IS REMEMBERED (24 Sep 2026)
 *   On the ACCOUNT, not in this browser. Rajat: "kae baar not now kar diya,
 *   everytime i open fir se dikh jata hai". It was a seven-day note in
 *   localStorage, which is empty again the moment the panel is opened from a
 *   link inside another app, in a private tab, or from a second phone - so the
 *   shop kept being asked something it had already answered. The server now
 *   holds the answer (`promptsOff`), and localStorage only makes the row
 *   disappear on the spot, before the save lands.
 */
const DISMISS_KEY = 'smp.push.off';

export default function PushToggle({ compact = false, off = false, onOff }) {
  const t = useT();
  const { state, busy, error, enable, disable, test } = usePush();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // localStorage is a browser-only external system; read it after paint.
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      if (!compact) return setDismissed(false);
      let local = false;
      try {
        local = localStorage.getItem(DISMISS_KEY) === '1';
      } catch {
        /* private mode */
      }
      setDismissed(local);
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
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
    // Answered once, for the account. If the save fails the row is still gone
    // for this browser - it is a nag, not a setting worth an error message.
    onOff?.();
    toast(t('We will not ask again.'), {
      description: t('Settings → Phone notifications turns it on whenever you want.'),
    });
  };

  if (state === 'checking') return null;
  if (compact && (off || dismissed || state === 'on' || state === 'unsupported')) return null;

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
    /*
     * Stacked on a phone, one line on a laptop (24 Sep 2026). It was a single
     * wrapping row: the buttons would not give up their width, the sentence
     * had `flex-1 min-w-0` so it shrank instead of pushing them down, and on a
     * 360px screen the whole message was a 13-pixel column reading one word a
     * line. A text block beside buttons needs a breakpoint, not flex-wrap.
     */
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-brand-ink/30 bg-brand-ink/5 px-4 py-3 text-sm sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">{copy.title}</p>
            <p className="text-muted-foreground">{copy.lead}</p>
            {error && <p className="mt-1 text-destructive">{error}</p>}
          </div>
        </div>
        <div className="shrink-0 sm:ml-auto">{actions}</div>
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
