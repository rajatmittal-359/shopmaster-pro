/**
 * The seller's money, in one place.
 *
 * Until now a seller could not see a rupee of this, and - more importantly -
 * had nowhere to put their bank account. The settlement code refuses to create
 * a payout for a seller with no account on file, so the absence of this one
 * form meant no third-party seller could ever be paid. That is the deadlock
 * this page opens.
 *
 * The four figures are deliberately separate rather than one "balance",
 * because a seller's first question is never "how much" but "when":
 *
 *   Ready to pay out    delivered, return window closed, waiting on a transfer
 *   Still clearing      sold, but undelivered or still returnable
 *   Already paid        transferred, with a reference to check against a bank
 *   Commission          what the platform kept, shown rather than hidden
 */
import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import Card from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import {
  getMyEarnings,
  getPayoutDetails,
  updatePayoutDetails,
} from '../../services/sellerService';
import { toastSuccess, toastError } from '../../utils/toast';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const onDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

const EMPTY_FORM = {
  accountHolderName: '',
  accountNumber: '',
  ifscCode: '',
  gstNumber: '',
};

export default function EarningsPage() {
  const [earnings, setEarnings] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [details, setDetails] = useState(null);
  const [returnWindowDays, setReturnWindowDays] = useState(7);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = async () => {
    try {
      setLoading(true);
      const [earned, bank] = await Promise.all([getMyEarnings(), getPayoutDetails()]);

      setEarnings(earned.data.earnings);
      setPayouts(earned.data.payouts || []);
      setReturnWindowDays(earned.data.returnWindowDays ?? 7);
      setDetails(bank.data);

      // Nothing on file yet, so open the form rather than making them hunt
      // for the button that opens it.
      if (!bank.data.bankDetails) setEditing(true);
    } catch (err) {
      console.error(err);
      toastError(err?.response?.data?.message || 'Could not load your earnings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await updatePayoutDetails({
        accountHolderName: form.accountHolderName.trim(),
        accountNumber: form.accountNumber.trim(),
        ifscCode: form.ifscCode.trim().toUpperCase(),
        ...(form.gstNumber.trim() ? { gstNumber: form.gstNumber.trim().toUpperCase() } : {}),
      });
      toastSuccess('Bank details saved');
      setForm(EMPTY_FORM);
      setEditing(false);
      await load();
    } catch (err) {
      // The server validates IFSC and account number shapes; show what it said
      // rather than a generic failure.
      toastError(err?.response?.data?.message || 'Could not save your bank details');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Earnings">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  const canBePaid = details?.canReceivePayouts;

  return (
    <Layout title="Earnings">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Earnings</h2>
          <p className="text-sm text-gray-600 mt-1">
            Money is released {returnWindowDays} days after a customer receives their
            order, once it can no longer be returned.
          </p>
        </div>

        {/*
          The one thing standing between a seller and their money. It leads the
          page while it is missing, and drops below the figures once it is not.
        */}
        {!canBePaid && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="font-medium text-amber-900">
              Add your bank account to get paid
            </p>
            <p className="text-sm text-amber-800 mt-1">
              Your sales are being counted, but nothing can be transferred until the
              shop knows where to send it.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Ready to pay out"
            value={money(earnings?.readyForPayout)}
            accent="success"
            hint="Delivered and past the return window. This goes in the next transfer."
          />
          <StatCard
            label="Still clearing"
            value={money(earnings?.pendingClearance)}
            hint="Sold, but not yet delivered or still inside the return window."
          />
          <StatCard
            label="Already paid"
            value={money(earnings?.paidOut)}
            accent="brand"
            hint="Transferred to your account."
          />
          <StatCard
            label="Platform commission"
            value={money(earnings?.commissionCharged)}
            hint="Kept by the shop on your sales so far."
          />
        </div>

        {/* ---------------------------------------------------- bank details */}
        <Card
          title="Where we send your money"
          hint={
            canBePaid
              ? 'Used for every transfer. Changing it affects future payouts only.'
              : 'Needed before any payout can be made.'
          }
          actions={
            canBePaid && !editing ? (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Change
              </Button>
            ) : null
          }
        >
          {!editing && details?.bankDetails && (
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-gray-500">Account holder</dt>
                <dd className="font-medium text-gray-900 mt-0.5">
                  {details.bankDetails.accountHolderName}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Account number</dt>
                <dd className="font-medium text-gray-900 mt-0.5 tabular-nums">
                  {details.bankDetails.accountNumber}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">IFSC</dt>
                <dd className="font-medium text-gray-900 mt-0.5">
                  {details.bankDetails.ifscCode}
                </dd>
              </div>
            </dl>
          )}

          {editing && (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm text-gray-700">Account holder name</span>
                  <input
                    required
                    value={form.accountHolderName}
                    onChange={(e) =>
                      setForm({ ...form, accountHolderName: e.target.value })
                    }
                    className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm
                               focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-orange-600"
                    placeholder="As printed on your passbook"
                  />
                </label>

                <label className="block">
                  <span className="text-sm text-gray-700">Account number</span>
                  <input
                    required
                    inputMode="numeric"
                    value={form.accountNumber}
                    onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                    className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm tabular-nums
                               focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-orange-600"
                  />
                </label>

                <label className="block">
                  <span className="text-sm text-gray-700">IFSC code</span>
                  <input
                    required
                    value={form.ifscCode}
                    onChange={(e) => setForm({ ...form, ifscCode: e.target.value })}
                    className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm uppercase
                               focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-orange-600"
                    placeholder="HDFC0001234"
                  />
                </label>

                <label className="block">
                  <span className="text-sm text-gray-700">
                    GST number <span className="text-gray-400">(optional)</span>
                  </span>
                  <input
                    value={form.gstNumber}
                    onChange={(e) => setForm({ ...form, gstNumber: e.target.value })}
                    className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm uppercase
                               focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-orange-600"
                  />
                </label>
              </div>

              <div className="flex gap-3">
                <Button type="submit" variant="primary" loading={saving} loadingText="Saving…">
                  Save bank details
                </Button>
                {canBePaid && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setForm(EMPTY_FORM);
                      setEditing(false);
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          )}
        </Card>

        {/* -------------------------------------------------------- history */}
        <Card title="Payout history" hint="Every transfer the shop has made to you.">
          {payouts.length === 0 ? (
            <EmptyState
              title="No payouts yet"
              hint={
                canBePaid
                  ? 'Transfers appear here once your delivered orders clear their return window.'
                  : 'Add your bank details above and your first transfer can be made.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-2 pr-4 font-medium">Payout</th>
                    <th className="py-2 pr-4 font-medium">Period</th>
                    <th className="py-2 pr-4 font-medium text-right">Amount</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p._id} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 pr-4 font-medium text-gray-900">
                        {p.payoutNumber}
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {onDate(p.periodFrom)} – {onDate(p.periodTo)}
                      </td>
                      <td className="py-3 pr-4 text-right font-medium tabular-nums">
                        {money(p.netPayable)}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge status={p.status} />
                      </td>
                      <td className="py-3 text-gray-600">
                        {p.reference || (p.status === 'failed' ? p.failureReason : '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
