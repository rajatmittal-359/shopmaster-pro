'use client';

import { useState } from 'react';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';

/**
 * The decision agent's brief on one dispute (plan 2.19), beside the buttons
 * that decide it. What each side has shown, what is missing, the rulebook's
 * answer and a recommendation with its confidence - drawn on demand, kept an
 * hour, redrawn on request. "Use this note" copies the suggested ruling into
 * the decision form; the admin still presses Record.
 *
 * Reference: Stripe's dispute evidence summary and Amazon's A-to-z case view -
 * claim, carrier proof, both sides, then the button.
 */
const REC = {
  customer: { label: 'Recommends: the customer', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  seller: { label: 'Recommends: the seller', tone: 'text-sky-700 bg-sky-50 border-sky-200' },
  partial: { label: 'Recommends: a split', tone: 'text-amber-700 bg-amber-50 border-amber-200' },
  need_more: { label: 'Needs more evidence', tone: 'text-muted-foreground bg-muted border-border' },
};

export default function DisputeBrief({ orderId, sellerId, onUseNote, onSuggest }) {
  const [state, setState] = useState({ status: 'idle' });

  const draw = async (fresh = false) => {
    setState({ status: 'loading' });
    try {
      const r = await authedFetch(`/admin/orders/${orderId}/dispute-brief?sellerId=${sellerId}${fresh ? '&fresh=1' : ''}`);
      setState({ status: 'done', ...r });
      if (onSuggest && ['customer', 'seller'].includes(r.brief?.recommendation)) onSuggest(r.brief.recommendation);
    } catch (e) {
      setState({ status: 'error', message: e.message });
    }
  };

  if (state.status === 'idle' || state.status === 'error') {
    return (
      <div className="mt-2">
        <Button type="button" variant="outline" size="sm" onClick={() => draw(false)} className="border-primary/40 text-brand-ink">
          <Sparkles className="size-4" /> Draft a brief
        </Button>
        {state.status === 'error' && <p className="mt-1 text-xs text-destructive">{state.message}</p>}
        <p className="mt-1 text-xs text-muted-foreground">Both sides&apos; evidence against the rulebook, with a recommendation. You decide.</p>
      </div>
    );
  }
  if (state.status === 'loading') {
    return (
      <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Reading the courier scans, the photos and both records…
      </p>
    );
  }

  const { brief, evidence, model, cached } = state;
  const rec = REC[brief.recommendation] || REC.need_more;
  const record = (r) => (r?.signals?.length ? r.signals.join('; ') : 'clean');
  return (
    <div className="mt-3 space-y-3 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${rec.tone}`}>{rec.label} · {Math.round(brief.confidence * 100)}%</span>
        <span className="text-xs text-muted-foreground">{model}{cached ? ' · drawn earlier' : ''}</span>
        <button type="button" onClick={() => draw(true)} className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <RefreshCw className="size-3" /> Redraw
        </button>
      </div>
      <p>{brief.summary}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">For the customer</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{(brief.forCustomer || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">For the seller</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{(brief.forSeller || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      </div>
      {brief.missing?.length > 0 && (
        <p className="text-xs text-muted-foreground"><span className="font-medium">Missing:</span> {brief.missing.join(' · ')}</p>
      )}
      <p className="text-xs"><span className="font-medium">Why:</span> {brief.reasoning}</p>
      {evidence && (
        <p className="text-xs text-muted-foreground">
          Records (180 days) - customer: {record(evidence.customer?.record)} · seller: {record(evidence.seller?.record)}
          {evidence.packProof ? ' · pack proof present' : ' · no pack proof'}
          {evidence.parcel?.podUrl ? ' · POD present' : ' · no POD'}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onUseNote?.(brief.resolutionNote)}>Use this note</Button>
        <span className="text-xs text-muted-foreground">“{brief.resolutionNote}”</span>
      </div>
    </div>
  );
}
