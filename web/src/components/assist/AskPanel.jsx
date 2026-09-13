'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, ThumbsUp, ThumbsDown, Sparkles, Globe, Database, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { useT } from '@/lib/i18n';
import Answer from './Answer';

/**
 * Ask ShopMaster - one chat for the seller panel, the admin and the
 * customer's Help page; `role` picks the API route and the starter
 * questions.
 *
 * REFERENCES
 *   Shopify Sidekick (a panel, starter chips, answers that link to the page
 *   that does the thing), Amazon's Seller Assistant (looks the seller's own
 *   orders and payouts up before answering), Flipkart's help bot (Hinglish,
 *   short). What none of them show and ours does: WHICH lookups the answer
 *   came from - "checked: your payouts, web" - so a shopkeeper can trust a
 *   number, and the admin can see where a wrong one came from.
 *
 * The thread lives in this component only. Nothing is stored in the
 * browser; the server keeps a 90-day log for the admin.
 */
const STARTERS = {
  seller: [
    'मेरा पेमेंट कब आएगा और कितना?',
    'Which of my listings need fixing first?',
    'Ek customer bol raha hai parcel nahi mila - kya karu?',
    'Cancel karne pe kya charge lagta hai, aur kyun?',
    'How do I get my products on Google?',
  ],
  admin: [
    'What needs my decision this weekend?',
    'Charming Jewels ka performance kaisa chal raha hai?',
    'Which sellers are close to the cancel-rate limit?',
    'How does the payout hold work when a dispute is open?',
    'Cutover plan me abhi kya bacha hai?',
  ],
  customer: [
    'Where is my last order?',
    'Mera refund kab tak aayega?',
    'How do returns and exchanges work?',
    'The courier says delivered but I have nothing.',
  ],
};

const ROUTE = { seller: '/seller/assist', admin: '/admin/assist', customer: '/customer/assist' };

export default function AskPanel({ role = 'seller', compact = false }) {
  const t = useT();
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread, busy]);

  const send = async (text) => {
    const q = String(text || draft).trim();
    if (!q || busy) return;
    setDraft('');
    const history = thread.filter((m) => m.text).map((m) => ({ role: m.role, text: m.text }));
    setThread((tq) => [...tq, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const r = await authedFetch(ROUTE[role], { method: 'POST', body: { question: q, history } });
      setThread((tq) => [...tq, { role: 'assistant', text: r.answer, id: r.id, model: r.model, calls: r.calls || [], searchedWeb: r.searchedWeb }]);
      window.dispatchEvent(new Event('smp:assist')); // the admin's log beside the chat refreshes
    } catch (e) {
      setThread((tq) => [...tq, { role: 'assistant', error: e.message }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const rate = async (id, helpful) => {
    setThread((tq) => tq.map((m) => (m.id === id ? { ...m, helpful } : m)));
    try {
      await authedFetch(`${ROUTE[role]}/${id}`, { method: 'PATCH', body: { helpful } });
    } catch {
      /* a verdict that did not save is not worth a toast */
    }
    if (!helpful) toast(t('Thanks - noted. For anything urgent, Help has a person.'));
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const starters = STARTERS[role] || [];

  return (
    <div className={`flex flex-col rounded-xl border bg-card ${compact ? 'max-h-[70vh]' : 'min-h-[60vh] max-h-[78vh]'}`}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {thread.length === 0 && (
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-brand-from/10 text-brand-from">
              <Sparkles className="size-5" aria-hidden />
            </div>
            <p className="font-medium">{t('Ask anything about your shop, an order, a payout or a rule.')}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {t('It reads your own data and the platform rules before it answers, in Hindi or English. It explains and points to the button - it never changes anything itself.')}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {starters.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border bg-background px-3 py-1.5 text-sm hover:bg-muted">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {thread.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-ink px-4 py-2.5 text-sm text-white [overflow-wrap:anywhere]">{m.text}</div>
            </div>
          ) : (
            <div key={i} className="flex gap-3">
              <div className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-brand-from/10 text-brand-from">
                <Sparkles className="size-3.5" aria-hidden />
              </div>
              <div className="min-w-0 max-w-[90%] flex-1">
                {m.error ? (
                  <div className="rounded-2xl rounded-tl-md border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm">
                    {m.error}
                    <button type="button" onClick={() => send(thread[i - 1]?.text)} className="ml-2 inline-flex items-center gap-1 font-medium text-brand-ink hover:underline">
                      <RotateCcw className="size-3" aria-hidden /> {t('Try again')}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl rounded-tl-md bg-muted/60 px-4 py-3">
                      <Answer text={m.text} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Database className="size-3" aria-hidden />
                        {t('Checked')}: {describeCalls(m.calls, t)}
                      </span>
                      {m.searchedWeb && (
                        <span className="inline-flex items-center gap-1">
                          <Globe className="size-3" aria-hidden /> {t('searched the web')}
                        </span>
                      )}
                      {m.model && !/gemini/i.test(m.model) && <span>· {t('backup model')}</span>}
                      {m.id && (
                        <span className="ml-auto inline-flex items-center gap-1">
                          <button type="button" aria-label={t('Helpful')} onClick={() => rate(m.id, true)} className={`rounded p-1 hover:bg-muted ${m.helpful === true ? 'text-emerald-600' : ''}`}>
                            <ThumbsUp className="size-3.5" />
                          </button>
                          <button type="button" aria-label={t('Not helpful')} onClick={() => rate(m.id, false)} className={`rounded p-1 hover:bg-muted ${m.helpful === false ? 'text-destructive' : ''}`}>
                            <ThumbsDown className="size-3.5" />
                          </button>
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        )}

        {busy && (
          <div className="flex gap-3">
            <div className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-brand-from/10 text-brand-from">
              <Sparkles className="size-3.5 animate-pulse" aria-hidden />
            </div>
            <div className="rounded-2xl rounded-tl-md bg-muted/60 px-4 py-3 text-sm text-muted-foreground">{t('Reading your data and the rules…')}</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t p-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            maxLength={1500}
            placeholder={t('Ask in Hindi or English…')}
            className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40 md:text-sm"
            aria-label={t('Your question')}
          />
          <button type="submit" disabled={busy || !draft.trim()} aria-label={t('Send')} className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-ink text-white disabled:opacity-40">
            <Send className="size-4" aria-hidden />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">{t('Answers come from your data and the rules; check anything about money on the page itself. Nothing you type is shared with other sellers.')}</p>
      </form>
    </div>
  );
}

const NAMES = {
  getOrder: 'the order',
  myRecentOrders: 'your orders',
  myPayouts: 'your payouts',
  productScore: 'the product',
  myPerformance: 'your performance',
  platformSummary: 'the platform',
  findSeller: 'the seller',
  listCategories: 'categories',
  searchKnowledge: 'the rulebook',
  webSearch: 'the web',
};
const describeCalls = (calls = [], t) => {
  const named = [...new Set(calls.map((c) => NAMES[c]).filter(Boolean))];
  return named.length ? named.map((n) => t(n)).join(', ') : t('your data and the rules');
};
