"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ActionDialog from "@/components/common/ActionDialog";

/**
 * Paying sellers what they are owed.
 *
 * WHY THIS WAS THE FIRST ADMIN SCREEN BUILT
 *   It is the only one where being absent costs somebody real money. Until it
 *   existed, settling a seller meant reading the database by hand - and a
 *   payout nobody can see is a payout that gets forgotten.
 *
 * WHAT "PAYABLE" MEANS, AND WHY IT IS NOT "DELIVERED"
 *   A line becomes payable only once its return window has closed.
 *   utils/payout.js holds that rule; this screen only shows the answer. Paying
 *   earlier means paying for goods that can still come back, with no clawback -
 *   the platform would absorb every one of those returns.
 *
 * TWO STEPS, DELIBERATELY
 *   "Create the payout" writes the record and freezes the amount. "I have
 *   transferred it" is pressed AFTERWARDS, with the bank reference. Doing both
 *   at once would mean the system says a seller was paid because somebody
 *   pressed a button - which is exactly the claim a seller will dispute.
 */
const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const when = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      })
    : "";

export default function Payouts() {
  const [payable, setPayable] = useState(null);
  const [history, setHistory] = useState([]);
  const [state, setState] = useState({ status: "loading" });
  const [reference, setReference] = useState({});
  const [failing, setFailing] = useState(null);

  const load = async () => {
    const [owed, past] = await Promise.all([
      authedFetch("/admin/payouts/payable"),
      authedFetch("/admin/payouts"),
    ]);
    setPayable(owed);
    setHistory(past.payouts || []);
    setState({ status: "idle" });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [owed, past] = await Promise.all([
          authedFetch("/admin/payouts/payable"),
          authedFetch("/admin/payouts"),
        ]);
        if (cancelled) return;
        setPayable(owed);
        setHistory(past.payouts || []);
        setState({ status: "idle" });
      } catch (err) {
        if (!cancelled) setState({ status: "error", message: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (fn) => {
    setState({ status: "working" });
    try {
      await fn();
      await load();
    } catch (err) {
      setState({ status: "error", message: err.message });
    }
  };

  if (state.status === "loading") {
    return (
      <div
        className="skeleton-in space-y-4"
        aria-busy="true"
        aria-label="Loading payouts"
      >
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <p aria-live="polite" className="min-h-5 text-sm">
        {state.status === "error" && (
          <span className="text-destructive">{state.message}</span>
        )}
      </p>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Owed right now</h2>
          <p className="text-sm text-muted-foreground">
            {money(payable?.totalPayable)} across{" "}
            {payable?.sellers?.length || 0} seller(s) · a line becomes payable{" "}
            {payable?.returnWindowDays} days after delivery
          </p>
        </div>

        {(payable?.sellers || []).length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing is due. Everything delivered recently is still inside its
            return window.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
            {payable.sellers.map((row) => (
              <li
                key={row.sellerId}
                className="flex flex-wrap items-center gap-4 p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {row.businessName || row.name || "Seller"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {money(row.grossSales)} sold · {money(row.commission)}{" "}
                    commission · {row.itemCount || 0} item(s)
                  </p>
                </div>

                <p className="text-lg font-semibold">{money(row.netPayable)}</p>

                <Button
                  disabled={state.status === "working"}
                  onClick={() =>
                    run(() =>
                      authedFetch("/admin/payouts", {
                        method: "POST",
                        body: { sellerId: row.sellerId },
                      }),
                    )
                  }
                >
                  Create the payout
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Payouts raised</h2>

        {history.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
            {history.map((payout) => (
              <li key={payout._id} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {payout.payoutNumber} · {payout.businessName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {money(payout.netPayable)} · {payout.itemCount} item(s) ·{" "}
                      {when(payout.periodFrom)} to {when(payout.periodTo)}
                    </p>
                  </div>
                  <p className="text-sm font-medium capitalize">
                    {payout.status}
                  </p>
                </div>

                {payout.status === "pending" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {/* The reference is the point. "Paid" without one is a
                        claim; with one it is a fact both sides can check. */}
                    <Label
                      htmlFor={`utr-${payout._id}`}
                      className="text-xs text-muted-foreground"
                    >
                      Bank reference / UTR
                    </Label>
                    <Input
                      id={`utr-${payout._id}`}
                      value={reference[payout._id] || ""}
                      onChange={(e) =>
                        setReference({
                          ...reference,
                          [payout._id]: e.target.value,
                        })
                      }
                      className="w-56"
                    />
                    <Button
                      disabled={
                        !reference[payout._id] || state.status === "working"
                      }
                      onClick={() =>
                        run(() =>
                          authedFetch(`/admin/payouts/${payout._id}/paid`, {
                            method: "PATCH",
                            body: { reference: reference[payout._id] },
                          }),
                        )
                      }
                    >
                      I have transferred it
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFailing(payout._id)}
                    >
                      The transfer failed
                    </Button>
                  </div>
                )}

                {payout.reference && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Reference {payout.reference}
                    {payout.paidAt ? ` · paid ${when(payout.paidAt)}` : ""}
                  </p>
                )}
                {payout.failureReason && (
                  <p className="mt-2 text-sm text-destructive">
                    {payout.failureReason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/*
        Recording a failed transfer is not destructive - it is bookkeeping, and
        the seller reads it to know why they have not been paid. Hence a normal
        button, not a red one: red on everything teaches people to ignore red.
      */}
      <ActionDialog
        open={Boolean(failing)}
        onOpenChange={(next) => setFailing(next ? failing : null)}
        title="Record a failed transfer"
        description="The payout goes back to unpaid, and the seller is told why."
        reasons={[
          "The account details are wrong",
          "The bank rejected it",
          "I have not made the transfer yet",
        ]}
        requireReason
        confirmLabel="Record the failure"
        busy={state.status === "working"}
        note="The seller sees this on their earnings page."
        onConfirm={(reason) => {
          const id = failing;
          setFailing(null);
          run(() =>
            authedFetch(`/admin/payouts/${id}/failed`, {
              method: "PATCH",
              body: { reason },
            }),
          );
        }}
      />
    </div>
  );
}
