'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { authedFetch } from '@/lib/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import ActionDialog from '@/components/common/ActionDialog';
import PanelTabs from '@/components/panel/PanelTabs';
import EditShopDialog from '@/components/admin/EditShopDialog';

/**
 * Who may sell here, and on what terms.
 *
 * THE SHAPE (15 Sep 2026, plan 2.40)
 *   Shopify's Customers / Staff index: tabs with counts, one row per shop,
 *   a status pill, the secondary actions behind ⋯, the row opens. Stripe
 *   Connect's accounts list for the pending ones: a status pill and the
 *   "requirements due" list underneath. Amazon's Account Health for the
 *   cancel metric: grey until there are enough orders to judge.
 *
 *   Before this the page was six cards, each repeating the commission hint,
 *   status spread over three lines, and an Approve button on a suspended
 *   shop (Rajat, 15 Sep: "iski UI/UX badhiya karo, socho").
 *
 * THE PENDING ROW
 *   Opens by default with "Before you approve": the facts the application
 *   does not say about itself (utils/kyc.applicationChecks - PAN, GSTIN
 *   checksum and state, IFSC, names), duplicates on other shops, what the
 *   model read on the board photo, and the buyer record. Three buttons:
 *   Approve · Ask for… (bell + mail with the exact sentence, the shop fixes
 *   it and comes back) · Turn down. No verdict is computed; the admin reads
 *   and decides.
 *
 * WHY COMMISSION IS EDITED HERE AND NOWHERE ELSE
 *   The rate is SNAPSHOTTED onto every order line when the order is placed,
 *   so changing it never rewrites history - it only changes what happens
 *   next. Said once, in the rate popover, not under every row.
 *
 * WHY SUSPENDING IS NOT DELETING
 *   A suspended seller's products come out of the shop and their account
 *   stays. Orders already placed still have to be delivered, returned and
 *   paid out; deleting the seller would orphan all of it.
 */
const stateOf = (s) => (s.status === 'suspended' ? 'suspended' : s.kycStatus === 'rejected' ? 'rejected' : s.isApproved ? 'approved' : s.applicationState === 'needs_info' ? 'needs_info' : 'pending');

const PILL = {
  pending: ['Waiting', 'bg-primary/10 text-brand-ink'],
  needs_info: ['Asked for info', 'bg-amber-500/10 text-amber-700 dark:text-amber-300'],
  approved: ['Selling', 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'],
  rejected: ['Turned down', 'bg-muted text-muted-foreground'],
  suspended: ['Suspended', 'bg-destructive/10 text-destructive'],
};

const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

function Fact({ ok, children }) {
  const tone = ok === true ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200' : ok === false ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200' : 'border-border text-muted-foreground';
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${tone}`}>
      <span aria-hidden className="shrink-0">{ok === true ? '✓' : ok === false ? '!' : '–'}</span>
      <span className="min-w-0 truncate" title={typeof children === 'string' ? children : undefined}>{children}</span>
    </span>
  );
}

/** Before you approve - the facts, as ticks, warnings and dashes. */
function BeforeYouApprove({ seller }) {
  const a = seller.application || {};
  const age = a.accountAgeDays;
  const board = seller.board;
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_12rem]">
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Before you approve</p>
        <div className="flex flex-wrap gap-1.5">
          <Fact ok={a.emailVerified ? true : false}>{a.emailVerified ? 'Email verified' : 'Email not verified'}</Fact>
          <Fact ok={age === null || age === undefined ? null : age >= 7 ? true : age < 1 ? false : null}>{age === null || age === undefined ? 'Account age unknown' : age < 1 ? 'Account made today' : `Account ${age} day${age === 1 ? '' : 's'} old`}</Fact>
          {(seller.checks || []).map((c) => <Fact key={c.key} ok={c.ok}>{c.label}</Fact>)}
          {board && <Fact ok={board.isShop === false ? false : board.text ? true : null}>{board.isShop === false ? 'Photo does not look like a shop' : board.text ? `Board reads “${board.text}”` : 'No readable board in the photo'}</Fact>}
          <Fact ok={a.pickup ? true : null}>{a.pickup ? `Pickup: ${a.pickup}` : 'No pickup address yet'}</Fact>
          <Fact ok={a.links > 0 ? true : null}>{a.links ? `${a.links} profile link${a.links === 1 ? '' : 's'}` : 'No Instagram / Google profile'}</Fact>
          {a.buyer && <Fact ok={a.buyer.orders > 0 && a.buyer.level === 'clean' ? true : a.buyer.level !== 'clean' ? false : null}>{a.buyer.orders ? `Bought here ${a.buyer.orders}× · ${a.buyer.level === 'clean' ? 'clean record' : a.buyer.signals.join(', ')}` : 'Never bought here'}</Fact>}
        </div>
        {(seller.duplicates || []).length > 0 && (
          <p className="mt-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
            Same {seller.duplicates.map((d) => `${d.shared.join(' + ')} as “${d.businessName}” (${d.state})`).join('; ')}.
          </p>
        )}
        {(a.sells || seller.legalName) && (
          <p className="mt-2 text-xs text-muted-foreground">
            {seller.legalName && seller.legalName !== seller.businessName ? `Legal name: ${seller.legalName}. ` : ''}{a.sells ? `Sells: ${a.sells}.` : ''}
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">A dash is not a reason to refuse - address, bank and story are on their first-day list. A warning is a reason to ask first.</p>
      </div>
      {seller.shopPhoto ? (
        <a href={seller.shopPhoto} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={seller.shopPhoto} alt={`${seller.businessName} shop photo`} className="aspect-[4/3] w-full object-cover" />
        </a>
      ) : (
        <div className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed text-xs text-muted-foreground">No shop photo</div>
      )}
    </div>
  );
}

/** The rate, edited in place - the hint said here, once. */
function RateEditor({ seller, onSave, busy }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(seller.commissionRate ?? 0));
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="tabular-nums hover:underline" title="Change the commission">
        {seller.commissionRate ?? 0}%
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Input value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} aria-label={`Commission for ${seller.businessName}`} className="h-7 w-16 text-right" autoFocus />
      <Button size="sm" variant="outline" className="h-7" disabled={busy || Number(value) === Number(seller.commissionRate)} onClick={async () => { await onSave(Number(value)); setOpen(false); }}>Set</Button>
      <Button size="sm" variant="ghost" className="h-7" onClick={() => setOpen(false)}>✕</Button>
      <span className="ml-1 hidden text-[0.65rem] text-muted-foreground lg:inline">future orders only</span>
    </span>
  );
}

export default function Sellers() {
  const [sellers, setSellers] = useState([]);
  const [state, setState] = useState({ status: 'loading' });
  const [open, setOpen] = useState({}); // expanded rows
  // { kind: 'reject' | 'suspend' | 'ask', seller }
  const [asking, setAsking] = useState(null);
  const [editing, setEditing] = useState(null); // seller whose shop details are being edited on their behalf

  const load = async () => {
    const data = await authedFetch('/admin/sellers/pending');
    setSellers(data.sellers || []);
    setState({ status: 'idle' });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authedFetch('/admin/sellers/pending');
        if (cancelled) return;
        setSellers(data.sellers || []);
        setState({ status: 'idle' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (fn) => {
    setState({ status: 'working' });
    try {
      await fn();
      await load();
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };
  const patch = (id, path, body) => run(() => authedFetch(`/admin/sellers/${id}${path}`, { method: 'PATCH', body }));

  const counts = useMemo(() => {
    const c = { waiting: 0, selling: 0, suspended: 0, turned: 0 };
    for (const s of sellers) {
      const st = stateOf(s);
      if (st === 'pending' || st === 'needs_info') c.waiting += 1;
      else if (st === 'approved') c.selling += 1;
      else if (st === 'suspended') c.suspended += 1;
      else c.turned += 1;
    }
    return c;
  }, [sellers]);

  if (state.status === 'loading') {
    return (
      <div className="skeleton-in space-y-4" aria-busy="true" aria-label="Loading sellers">
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  const rowsFor = (tab) => sellers.filter((s) => {
    const st = stateOf(s);
    if (tab === 'all') return true;
    if (tab === 'waiting') return st === 'pending' || st === 'needs_info';
    if (tab === 'selling') return st === 'approved';
    if (tab === 'suspended') return st === 'suspended';
    return st === 'rejected';
  });

  return (
    <div>
      <p aria-live="polite" className="min-h-5 text-sm">
        {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
      </p>

      <PanelTabs
        defaultTab={counts.waiting > 0 ? 'waiting' : 'all'}
        tabs={[
          { key: 'waiting', label: 'Waiting for you', count: counts.waiting },
          { key: 'selling', label: 'Selling', count: counts.selling },
          { key: 'suspended', label: 'Suspended', count: counts.suspended },
          { key: 'turned', label: 'Turned down', count: counts.turned },
          { key: 'all', label: 'All' },
        ]}
      >
        {(tab) => {
          const rows = rowsFor(tab);
          if (rows.length === 0) {
            return <p className="rounded-xl border p-6 text-sm text-muted-foreground">{tab === 'waiting' ? 'Nobody is waiting. New applications ring the bell.' : 'Nothing here.'}</p>;
          }
          return (
            <div className="overflow-hidden rounded-xl border">
              <div className="hidden grid-cols-[1fr_8rem_7rem_6rem_9rem_2.5rem] items-center gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
                <span>Shop</span><span>Status</span><span>Agreement</span><span className="text-right">Commission</span><span>Cancels · 30 d</span><span />
              </div>
              <ul className="divide-y">
                {rows.map((seller) => {
                  const st = stateOf(seller);
                  const [pillLabel, pillTone] = PILL[st];
                  const waiting = st === 'pending' || st === 'needs_info';
                  const isOpen = open[seller._id] ?? waiting;
                  const c = seller.cancellations;
                  const enough = c && c.orders >= 10;
                  return (
                    <li key={seller._id} className="px-4 py-3">
                      <div className="grid grid-cols-1 items-center gap-2 md:grid-cols-[1fr_8rem_7rem_6rem_9rem_2.5rem] md:gap-3">
                        <button type="button" onClick={() => setOpen({ ...open, [seller._id]: !isOpen })} className="flex min-w-0 items-center gap-2 text-left" aria-expanded={isOpen}>
                          <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? '' : '-rotate-90'}`} aria-hidden />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{seller.businessName || seller.shopName}</span>
                            <span className="block truncate text-xs text-muted-foreground">{seller.userId?.email || seller.email || ''}{seller.application?.appliedAt ? ` · applied ${when(seller.application.appliedAt)}` : ''}</span>
                          </span>
                        </button>
                        <span><Badge className={pillTone}>{pillLabel}</Badge></span>
                        <span className="text-xs">
                          {seller.agreementUpToDate ? <span className="text-muted-foreground">v{seller.agreement?.version} ✓</span> : <span className="text-amber-700 dark:text-amber-300">Not accepted</span>}
                        </span>
                        <span className="text-sm md:text-right">
                          <span className="mr-1 text-xs text-muted-foreground md:hidden">Commission</span>
                          <RateEditor seller={seller} busy={state.status === 'working'} onSave={(commissionRate) => patch(seller._id, '/commission', { commissionRate })} />
                        </span>
                        <span className={`text-xs ${enough && c.ratePct > c.reviewAbovePct ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {!c || c.orders === 0 ? '—' : `${c.cancelledBySeller} of ${c.orders}${enough ? ` (${c.ratePct}%)` : ' · too few to judge'}`}
                        </span>
                        <span className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger aria-label={`More for ${seller.businessName}`} className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground">
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              {st === 'approved' && (
                                <DropdownMenuItem render={<Link href={`/sellers/${seller.userId?._id || seller.userId}`} target="_blank" rel="noreferrer" />}>
                                  <ExternalLink className="size-4" /> Shop page
                                </DropdownMenuItem>
                              )}
                              {waiting && <DropdownMenuItem onClick={() => patch(seller._id, '/approve')}>Approve</DropdownMenuItem>}
                              {waiting && <DropdownMenuItem onClick={() => setAsking({ kind: 'ask', seller })}>Ask for…</DropdownMenuItem>}
                              {waiting && <DropdownMenuItem onClick={() => setAsking({ kind: 'reject', seller })}>Turn down</DropdownMenuItem>}
                              {st === 'rejected' && <DropdownMenuItem onClick={() => patch(seller._id, '/approve')}>Approve after all</DropdownMenuItem>}
                              {(st === 'approved' || waiting) && <DropdownMenuItem onClick={() => setEditing(seller)}>Edit shop details for them</DropdownMenuItem>}
                              {st === 'approved' && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setAsking({ kind: 'suspend', seller })}>Suspend</DropdownMenuItem></>}
                              {st === 'suspended' && <DropdownMenuItem onClick={() => patch(seller._id, '/activate')}>Let them sell again</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </span>
                      </div>

                      {isOpen && (
                        <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                          {st === 'needs_info' && seller.infoRequested?.reason && (
                            <p className="mb-3 text-xs"><span className="font-medium text-amber-700 dark:text-amber-300">Asked {when(seller.infoRequested.at)}:</span> “{seller.infoRequested.reason}” — waiting for them.</p>
                          )}
                          <BeforeYouApprove seller={seller} />
                          {waiting && (
                            <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                              <Button disabled={state.status === 'working'} onClick={() => patch(seller._id, '/approve')}>Approve</Button>
                              <Button variant="outline" disabled={state.status === 'working'} onClick={() => setAsking({ kind: 'ask', seller })}>Ask for…</Button>
                              <Button variant="ghost" disabled={state.status === 'working'} onClick={() => setAsking({ kind: 'reject', seller })}>Turn down</Button>
                            </div>
                          )}
                          {st === 'suspended' && seller.suspensionReason && <p className="mt-3 text-xs text-muted-foreground">Suspended: {seller.suspensionReason}</p>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        }}
      </PanelTabs>

      <EditShopDialog seller={editing} open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)} onSaved={load} />

      {/*
        Three decisions, one dialog. Asking is the everyday one - Amazon's
        "additional information required" - and the sentence typed here lands
        in the shop's bell and mail word for word, so the named reasons are
        written as sentences to a person.
      */}
      <ActionDialog
        open={Boolean(asking)}
        onOpenChange={(next) => setAsking(next ? asking : null)}
        title={
          asking?.kind === 'suspend'
            ? `Suspend ${asking?.seller?.businessName || 'this shop'}`
            : asking?.kind === 'ask'
              ? `Ask ${asking?.seller?.businessName || 'them'} for…`
              : `Turn down ${asking?.seller?.businessName || 'this application'}`
        }
        description={
          asking?.kind === 'suspend'
            ? 'Their products come out of the shop straight away. Orders already placed still have to be delivered, returned and paid out.'
            : asking?.kind === 'ask'
              ? 'They get a bell and a mail with exactly this sentence, fix it under Sell, and the application comes back to this list.'
              : 'They are told, with the reason, and can fix it and send the application again.'
        }
        reasons={
          asking?.kind === 'suspend'
            ? ['Not dispatching orders', 'Repeated cancellations', 'Complaints about quality', 'Suspected fraud']
            : asking?.kind === 'ask'
              ? [
                  'The GSTIN is registered to a different PAN - please type the PAN the GST was taken on.',
                  'Please add a photo of your shop board or workshop so we can see the shop.',
                  'The bank account holder name does not match the business - whose account is it?',
                  'Your pickup PIN code is outside the state your GST is registered in - which is right?',
                  'Please write two lines about the shop under Settings → On the web.',
                ]
              : ['We could not verify the business', 'They sell something we do not carry', 'The same shop has applied already']
        }
        requireReason
        destructive={asking?.kind !== 'ask'}
        confirmLabel={asking?.kind === 'suspend' ? 'Suspend this shop' : asking?.kind === 'ask' ? 'Send the ask' : 'Turn it down'}
        busy={state.status === 'working'}
        note="The seller reads this."
        onConfirm={(reason) => {
          const { kind, seller } = asking;
          setAsking(null);
          patch(seller._id, kind === 'suspend' ? '/suspend' : kind === 'ask' ? '/ask' : '/reject', { reason });
        }}
      />
    </div>
  );
}
