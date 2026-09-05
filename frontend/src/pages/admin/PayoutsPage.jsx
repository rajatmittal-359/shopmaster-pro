/**
 * Paying the sellers.
 *
 * The settlement code has existed and been tested from the start, but nothing
 * ever called it - which is why the payouts collection is empty and why no
 * third-party seller has been paid.
 *
 * THE FLOW, and the reason it is two steps rather than one:
 *
 *   1. "Pay" claims everything currently owed to a seller into one payout,
 *      marked pending. The lines are stamped with its id, so a second run
 *      cannot claim them again.
 *   2. You make the actual bank transfer yourself, outside this screen.
 *   3. You come back and record the UTR, which marks it paid.
 *
 * The shop cannot move money on its own, so a payout is a record of an
 * intention until a human confirms it happened. Marking one failed puts its
 * sales straight back in the payable pool.
 */
import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import Card from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import {
  getPayableSellers,
  listPayouts,
  createPayout,
  markPayoutPaid,
  markPayoutFailed,
} from '../../services/adminService';
import { toastSuccess, toastError } from '../../utils/toast';
import { useConfirm } from '../../context/confirmContext';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const onDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export default function PayoutsPage() {
  const confirm = useConfirm();

  const [payable, setPayable] = useState([]);
  const [totalPayable, setTotalPayable] = useState(0);
  const [returnWindowDays, setReturnWindowDays] = useState(7);
  const [payouts, setPayouts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  /** Which payout is having its transfer reference entered. */
  const [settling, setSettling] = useState(null);
  const [reference, setReference] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const [owed, history] = await Promise.all([getPayableSellers(), listPayouts()]);

      setPayable(owed.data.sellers || []);
      setTotalPayable(owed.data.totalPayable || 0);
      setReturnWindowDays(owed.data.returnWindowDays ?? 7);
      setPayouts(history.data.payouts || []);
    } catch (err) {
      console.error(err);
      toastError(err?.response?.data?.message || 'Could not load payouts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (row) => {
    const sure = await confirm({
      title: `Pay ${row.businessName}?`,
      message: `This claims ${money(row.netPayable)} across ${row.itemCount} item(s) into one payout. You still have to make the bank transfer yourself, then record the reference here.`,
      confirmLabel: 'Create payout',
      cancelLabel: 'Not now',
    });
    if (!sure) return;

    try {
      setBusyId(row.sellerId);
      await createPayout(row.sellerId);
      toastSuccess(`Payout created for ${row.businessName}`);
      await load();
    } catch (err) {
      // The most common reason is the seller having no bank details on file -
      // say so plainly, because the fix is theirs, not yours.
      toastError(err?.response?.data?.message || 'Could not create the payout');
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkPaid = async (payout) => {
    if (!reference.trim()) {
      toastError('Enter the bank reference (UTR) so this can be checked later');
      return;
    }

    try {
      setBusyId(payout._id);
      await markPayoutPaid(payout._id, { reference: reference.trim() });
      toastSuccess(`${payout.payoutNumber} marked paid`);
      setSettling(null);
      setReference('');
      await load();
    } catch (err) {
      toastError(err?.response?.data?.message || 'Could not mark it paid');
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkFailed = async (payout) => {
    const sure = await confirm({
      title: `Mark ${payout.payoutNumber} failed?`,
      message:
        'The sales in this payout go back into the payable pool, so they can be settled again later.',
      confirmLabel: 'Mark failed',
      cancelLabel: 'Keep it',
      danger: true,
    });
    if (!sure) return;

    try {
      setBusyId(payout._id);
      await markPayoutFailed(payout._id, 'Transfer failed');
      toastSuccess('Marked failed; those sales are payable again');
      await load();
    } catch (err) {
      toastError(err?.response?.data?.message || 'Could not mark it failed');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <Layout title="Payouts">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-gray-200 rounded-lg w-1/3" />
          <div className="h-24 bg-gray-200 rounded-lg" />
          <div className="h-40 bg-gray-200 rounded-lg" />
        </div>
      </Layout>
    );
  }

  const pendingCount = payouts.filter((p) => p.status === 'pending').length;

  return (
    <Layout title="Payouts">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Payouts</h2>
          <p className="text-sm text-gray-600 mt-1">
            A sale becomes payable {returnWindowDays} days after delivery, once the
            customer can no longer return it. Your own shop is not paid out — its
            takings are already in the platform account.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            label="Owed right now"
            value={money(totalPayable)}
            accent={totalPayable > 0 ? 'brand' : 'neutral'}
            hint={`Across ${payable.length} seller(s), ready to transfer.`}
          />
          <StatCard
            label="Awaiting transfer"
            value={pendingCount}
            accent={pendingCount > 0 ? 'warning' : 'neutral'}
            hint="Payouts created here but not yet sent from the bank."
          />
          <StatCard
            label="Payouts made"
            value={payouts.filter((p) => p.status === 'paid').length}
            accent="success"
            hint="Transfers confirmed with a reference."
          />
        </div>

        {/* ------------------------------------------------------ owed now */}
        <Card
          title="Sellers owed money"
          hint="Delivered, out of the return window, and not yet claimed by a payout."
        >
          {payable.length === 0 ? (
            <EmptyState
              title="Nobody is owed anything today"
              hint={`Sales appear here ${returnWindowDays} days after they are delivered.`}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-2 pr-4 font-medium">Seller</th>
                    <th className="py-2 pr-4 font-medium">Period</th>
                    <th className="py-2 pr-4 font-medium text-right">Gross</th>
                    <th className="py-2 pr-4 font-medium text-right">Commission</th>
                    <th className="py-2 pr-4 font-medium text-right">They get</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {payable.map((row) => (
                    <tr
                      key={row.sellerId}
                      className="border-b border-gray-100 last:border-0"
                    >
                      <td className="py-3 pr-4">
                        <p className="font-medium text-gray-900">{row.businessName}</p>
                        <p className="text-xs text-gray-500">{row.itemCount} item(s)</p>
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {onDate(row.periodFrom)} – {onDate(row.periodTo)}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-gray-600">
                        {money(row.grossSales)}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-gray-600">
                        −{money(row.commission)}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums font-medium text-gray-900">
                        {money(row.netPayable)}
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          size="sm"
                          variant="primary"
                          loading={busyId === row.sellerId}
                          loadingText="Creating…"
                          onClick={() => handleCreate(row)}
                        >
                          Pay
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* -------------------------------------------------------- history */}
        <Card
          title="All payouts"
          hint="Record the bank reference once a transfer has actually gone through."
        >
          {payouts.length === 0 ? (
            <EmptyState
              title="No payouts yet"
              hint="They appear here as soon as you settle a seller above."
            />
          ) : (
            <div className="space-y-3">
              {payouts.map((p) => (
                <div
                  key={p._id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{p.payoutNumber}</p>
                        <Badge status={p.status} />
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {p.businessName} · {p.itemCount} item(s) ·{' '}
                        {onDate(p.periodFrom)} – {onDate(p.periodTo)}
                      </p>
                      {p.reference && (
                        <p className="text-sm text-gray-600 mt-1">
                          Reference: <span className="tabular-nums">{p.reference}</span>
                        </p>
                      )}
                      {p.status === 'failed' && p.failureReason && (
                        <p className="text-sm text-red-700 mt-1">{p.failureReason}</p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-bold tabular-nums text-gray-900">
                        {money(p.netPayable)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {money(p.grossSales)} less {money(p.commission)}
                      </p>
                    </div>
                  </div>

                  {p.status === 'pending' && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      {settling === p._id ? (
                        <div className="flex flex-col sm:flex-row gap-3">
                          <input
                            autoFocus
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            placeholder="Bank reference / UTR"
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm
                                       focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-orange-600"
                          />
                          <Button
                            variant="primary"
                            loading={busyId === p._id}
                            loadingText="Saving…"
                            onClick={() => handleMarkPaid(p)}
                          >
                            Mark paid
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setSettling(null);
                              setReference('');
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-3">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              setSettling(p._id);
                              setReference('');
                            }}
                          >
                            Record transfer
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            loading={busyId === p._id}
                            onClick={() => handleMarkFailed(p)}
                          >
                            Transfer failed
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
