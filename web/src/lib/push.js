'use client';

import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from '@/lib/client';

/**
 * The seller's "Turn on notifications" (plan 2.26), browser side.
 *
 * One hook, five states the card draws:
 *   unsupported   this browser cannot push (old iOS Safari in a tab, in-app browsers)
 *   ios-install   iPhone/iPad: push works only once the site is on the Home Screen
 *   denied        the person said no once; only the browser's site settings undo that
 *   off           supported, not subscribed yet → the button
 *   on            subscribed on this device → "Send a test", "Turn off"
 *
 * The subscription goes to the API keyed by endpoint; the server pushes to
 * every device a seller registered. Nothing here caches or works offline.
 */
const urlB64ToUint8 = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const isIOS = () => typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent);
const standalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true);
const deviceLabel = () => {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : isIOS() ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  return `${br} · ${os}`;
};

export function usePush() {
  const [state, setState] = useState('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState(isIOS() && !standalone() ? 'ios-install' : 'unsupported');
      return;
    }
    if (Notification.permission === 'denied') return setState('denied');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setState(sub ? 'on' : 'off');
    } catch {
      setState('off');
    }
  }, []);

  useEffect(() => {
    // The browser's permission + registration are the external system; ask after paint.
    Promise.resolve().then(refresh);
  }, [refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const { publicKey } = await authedFetch('/seller/push/public-key');
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return false;
      }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(publicKey) });
      await authedFetch('/seller/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON(), label: deviceLabel() } });
      setState('on');
      return true;
    } catch (e) {
      setError(e.message || 'Could not turn notifications on');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await authedFetch('/seller/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => {});
        await sub.unsubscribe();
      }
      setState('off');
    } catch (e) {
      setError(e.message || 'Could not turn notifications off');
    } finally {
      setBusy(false);
    }
  }, []);

  const test = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      await authedFetch('/seller/push/test', { method: 'POST' });
      return true;
    } catch (e) {
      setError(e.message || 'Nothing arrived');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, enable, disable, test, refresh };
}
