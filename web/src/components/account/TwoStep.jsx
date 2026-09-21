'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { encode, toPath } from '@/lib/qr';
import { useReauth } from '@/components/common/Reauth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Two-step sign-in with an authenticator app (22 Sep 2026).
 *
 * Shopify's "Two-step authentication" card, in three screens: off (one
 * button), scan (QR + the key for typing, then the first code), and the
 * recovery codes shown once with copy and download. The admin's is
 * mandatory - the card says so and has no "turn off". Sellers may turn it
 * off with a current code. Every write goes through step-up (password
 * dialog) because this is the lock on the account.
 */
const when = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** The QR as one SVG path on a white square - scanners want black on white whatever the theme. */
function QrSvg({ text }) {
  const qr = useMemo(() => encode(text), [text]);
  const pad = 4; // the quiet zone the standard asks for
  return (
    <svg viewBox={`${-pad} ${-pad} ${qr.size + pad * 2} ${qr.size + pad * 2}`} shapeRendering="crispEdges" role="img" aria-label="QR code for the authenticator app" className="h-44 w-44 rounded-md bg-white">
      <rect x={-pad} y={-pad} width={qr.size + pad * 2} height={qr.size + pad * 2} fill="#fff" />
      <path d={toPath(qr)} fill="#000" />
    </svg>
  );
}

function RecoveryCodes({ codes, onDone }) {
  const text = codes.join('\n');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy - select the codes and copy them by hand');
    }
  };
  const download = () => {
    const blob = new Blob([`ShopMaster Pro recovery codes (each works once)\n\n${text}\n`], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'shopmaster-pro-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="space-y-3">
      <p className="text-sm">
        <strong>Save these recovery codes now.</strong> Each signs you in once if the phone is lost. They are shown only this once.
      </p>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg border bg-muted/40 p-4 font-mono text-sm sm:grid-cols-4">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>Copy</Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>Download .txt</Button>
        <Button type="button" size="sm" onClick={onDone}>I have saved them</Button>
      </div>
    </div>
  );
}

export default function TwoStep({ role }) {
  const reauth = useReauth();
  const [me, setMe] = useState(null); // { enabled, enabledAt }
  const [stage, setStage] = useState('idle'); // idle | scan | codes | off
  const [setup, setSetup] = useState(null); // { secret, otpauth }
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mandatory = role === 'admin';

  useEffect(() => {
    authedFetch('/auth/me').then((d) => setMe({ enabled: Boolean(d.user?.totp?.enabled), enabledAt: d.user?.totp?.enabledAt || null })).catch(() => setMe({ enabled: false, enabledAt: null }));
  }, []);

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const d = await reauth.run(() => authedFetch('/auth/2fa/setup', { method: 'POST', body: {} }));
      setSetup(d);
      setCode('');
      setStage('scan');
    } catch (err) {
      if (err.code !== 'reauth_cancelled') toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await authedFetch('/auth/2fa/verify', { method: 'POST', body: { code } });
      setCodes(d.recoveryCodes || []);
      setMe({ enabled: true, enabledAt: new Date().toISOString() });
      setStage('codes');
      toast.success('Two-step sign-in is on');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const newCodes = async () => {
    setBusy(true);
    try {
      const d = await reauth.run(() => authedFetch('/auth/2fa/recovery-codes', { method: 'POST', body: {} }));
      setCodes(d.recoveryCodes || []);
      setStage('codes');
    } catch (err) {
      if (err.code !== 'reauth_cancelled') toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await reauth.run(() => authedFetch('/auth/2fa/disable', { method: 'POST', body: { code } }));
      setMe({ enabled: false, enabledAt: null });
      setStage('idle');
      setCode('');
      toast('Two-step sign-in is off');
    } catch (err) {
      if (err.code !== 'reauth_cancelled') setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const keyGroups = setup?.secret ? setup.secret.match(/.{1,4}/g).join(' ') : '';

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Two-step sign-in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            After your password, a 6-digit code from an authenticator app on your phone (Google Authenticator, Authy, 1Password).
            {mandatory ? ' Required for the admin account.' : ' Recommended for every shop.'}
          </p>
        </div>
        {me && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${me.enabled ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : mandatory ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-muted text-muted-foreground'}`}>
            {me.enabled ? `On${me.enabledAt ? ` since ${when(me.enabledAt)}` : ''}` : mandatory ? 'Not set up yet' : 'Off'}
          </span>
        )}
      </div>

      <div className="mt-4">
        {!me && <p className="text-sm text-muted-foreground">Checking…</p>}

        {me && stage === 'idle' && !me.enabled && (
          <Button type="button" onClick={start} disabled={busy}>{busy ? 'Starting…' : 'Set up two-step sign-in'}</Button>
        )}

        {me && stage === 'idle' && me.enabled && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={newCodes} disabled={busy}>New recovery codes</Button>
            {!mandatory && <Button type="button" variant="outline" onClick={() => { setCode(''); setError(''); setStage('off'); }}>Turn off</Button>}
          </div>
        )}

        {stage === 'scan' && setup && (
          <form onSubmit={verify} className="grid gap-5 sm:grid-cols-[auto_1fr]">
            <QrSvg text={setup.otpauth} />
            <div className="space-y-3">
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                <li>Open the authenticator app and add an account.</li>
                <li>
                  Scan the square, or type this key: <code className="select-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs tracking-wider">{keyGroups}</code>
                  {' '}<a href={setup.otpauth} className="text-brand-ink hover:underline">(on a phone, open it directly)</a>
                </li>
                <li>Enter the 6-digit code it shows.</li>
              </ol>
              <div className="max-w-xs">
                <Label htmlFor="totp-first">Code from the app</Label>
                <Input id="totp-first" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="font-mono tracking-widest" />
              </div>
              <p aria-live="polite" className="min-h-5 text-sm text-destructive">{error}</p>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Turn on'}</Button>
                <Button type="button" variant="ghost" onClick={() => setStage('idle')}>Cancel</Button>
              </div>
            </div>
          </form>
        )}

        {stage === 'codes' && <RecoveryCodes codes={codes} onDone={() => setStage('idle')} />}

        {stage === 'off' && (
          <form onSubmit={turnOff} className="space-y-3">
            <p className="text-sm">Enter the current code from the app (or a recovery code) to turn two-step sign-in off.</p>
            <div className="max-w-xs">
              <Label htmlFor="totp-off">Code</Label>
              <Input id="totp-off" inputMode="text" autoComplete="off" autoCapitalize="characters" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 9))} className="font-mono tracking-widest" />
            </div>
            <p aria-live="polite" className="min-h-5 text-sm text-destructive">{error}</p>
            <div className="flex gap-2">
              <Button type="submit" variant="outline" className="text-destructive" disabled={busy || code.length < 6}>{busy ? 'Checking…' : 'Turn off'}</Button>
              <Button type="button" variant="ghost" onClick={() => setStage('idle')}>Cancel</Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
