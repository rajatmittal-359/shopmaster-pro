'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/client';
import { orderRef } from '@/lib/orderRef';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';

/**
 * The return tag - one per unit, printed before packing (plan §4.39 step 3).
 *
 * WHY A TAG
 *   Myntra and Flipkart's "no tag, no return" is what makes a 7-day
 *   change-of-mind return safe for the seller: a piece that comes back
 *   with the tag still on was not worn to the wedding first. The customer
 *   already ticks "tag intact" when asking for a return; until now the
 *   seller had nothing to put ON the item, so the promise had no object.
 *   (Rajat, 13 Sep: "ladki 2 din pehen ke wapas kar de… dono ka dhyan".)
 *
 * WHAT IT IS
 *   A sheet of small cards, one per unit on this seller's lines, cut along
 *   the dotted line and tied on with the tamper seal (or a thread through
 *   a hole punched in the corner). The card names the shop, the order,
 *   the item, the unit and the rule for that item's return mode, in Hindi
 *   and English because the customer can be anywhere in India. The pack
 *   proof photo is taken with the tag showing - that photo is the evidence.
 *
 * WHY NO BARCODE
 *   Myntra scans tags at a warehouse. Here the seller opens the parcel
 *   themselves and reads the order number off the card; a barcode library
 *   would be weight for nothing. The order number is the code.
 *
 * WHY NO PDF LIBRARY
 *   Same as the invoice: the browser prints; "Save as PDF" is the PDF.
 */
const RULE = {
  R: ['Return or exchange within the window only with this tag on and unbroken.', 'वापसी या बदली तभी जब यह टैग लगा हो और टूटा न हो।'],
  X: ['Exchange only, with this tag on and unbroken. No refund for change of mind.', 'सिर्फ़ बदली - यह टैग लगा और सही हो। मन बदलने पर पैसा वापस नहीं।'],
  N: ['Not returnable for change of mind (hygiene item). Damaged or wrong item: always.', 'मन बदलने पर वापसी नहीं (स्वच्छता की चीज़)। टूटा या गलत आए तो हमेशा।'],
};

export default function ReturnTag({ orderId }) {
  const t = useT();
  const [order, setOrder] = useState(null);
  const [shop, setShop] = useState('');
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.all([authedFetch(`/seller/orders/${orderId}`), authedFetch('/seller/settings')])
      .then(([o, s]) => {
        if (cancelled) return;
        setOrder(o.order || o);
        setShop(s.settings?.businessName || '');
        setState({ status: 'idle' });
      })
      .catch((err) => !cancelled && setState({ status: 'error', message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (state.status === 'loading') return <p className="p-6 text-muted-foreground">{t('Loading…')}</p>;
  if (state.status === 'error') return <p className="p-6 text-destructive">{state.message}</p>;
  if (!order) return null;

  const ref = orderRef(order);
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  // One card per UNIT: a customer who bought two returns one, and the tag says which.
  const cards = [];
  (order.items || [])
    .filter((i) => i.status !== 'cancelled')
    .forEach((item, li) => {
      for (let u = 1; u <= (item.quantity || 1); u += 1) {
        cards.push({ key: `${item._id}-${u}`, item, unit: item.quantity > 1 ? `${u}/${item.quantity}` : '', line: li + 1 });
      }
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link href={`/seller/orders/${orderId}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← {t('Back to the order')}
          </Link>
          <h1 className="mt-1 text-lg font-semibold">{t('Return tags')} · {ref}</h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            {t('Print, cut along the dotted line, tie one on each piece with the seal - then take the pack proof photo with the tag showing. A piece that comes back without it is not a change-of-mind return.')}
          </p>
        </div>
        <Button onClick={() => window.print()}>{t('Print')}</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-3">
        {cards.map(({ key, item, unit, line }) => {
          const [en, hi] = RULE[item.returnMode] || RULE.R;
          return (
            <article key={key} className="break-inside-avoid rounded-lg border-2 border-dashed border-foreground/40 bg-white p-4 text-black print:rounded-none" style={{ minHeight: '5.2cm' }}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-base font-bold leading-tight">{shop || 'Seller'}</p>
                <p className="shrink-0 font-mono text-xs">{ref}</p>
              </div>
              <p className="mt-2 text-sm font-medium leading-snug">
                {item.name}
                {unit && <span className="ml-2 font-mono text-xs text-black/60">{t('piece')} {unit}</span>}
              </p>
              <p className="mt-2 text-[11px] leading-snug">{en}</p>
              <p className="text-[11px] leading-snug">{hi}</p>
              <div className="mt-2 flex items-center justify-between text-[10px] text-black/60">
                <span>
                  {t('Line')} {line} · {today}
                </span>
                <span>ShopMaster Pro</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
