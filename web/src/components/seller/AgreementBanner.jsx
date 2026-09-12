'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';

/**
 * Sellers who existed before the agreement did, and sellers after a version
 * bump, read and accept the current version here - at the top of every
 * panel page until they do. Amazon's Seller Central does the same with a
 * blocking notice when its agreement changes.
 *
 * It asks; it does not lock the panel. A shop with parcels to send today is
 * not stopped from sending them by a document - but the banner does not go
 * away until they have read it, and the admin's list shows who has not.
 */
export default function AgreementBanner() {
  const [state, setState] = useState(null); // { upToDate, currentVersion, version }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authedFetch('/seller/settings')
      .then((d) => {
        if (!cancelled) setState(d.settings?.agreement || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state || state.upToDate) return null;

  const accept = async () => {
    setBusy(true);
    try {
      await authedFetch('/seller/agreement/accept', { method: 'POST', body: { agreementVersion: state.currentVersion } });
      setState({ ...state, upToDate: true });
      toast.success(`Seller Agreement v${state.currentVersion} accepted`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
      <p className="min-w-0 flex-1">
        <strong>{state.version ? `The Seller Agreement changed (v${state.currentVersion}).` : `Please read the Seller Agreement (v${state.currentVersion}).`}</strong>{' '}
        It sets out dispatch times, cancellation charges, returns, disputes, payouts and commission — the rules
        every shop here sells by.{' '}
        <Link href="/selling-policy" target="_blank" rel="noopener" className="text-brand-ink underline">
          Read it
        </Link>
        .
      </p>
      <Button size="sm" onClick={accept} disabled={busy}>
        {busy ? 'Saving…' : 'I have read it and agree'}
      </Button>
    </div>
  );
}
