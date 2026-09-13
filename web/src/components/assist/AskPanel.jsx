'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, ThumbsUp, ThumbsDown, Sparkles, Globe, Database, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { useT, useLang } from '@/lib/i18n';
import { speak, stopSpeaking } from '@/lib/voice';
import MicButton from '@/components/voice/MicButton';
import LangToggle from '@/components/panel/LangToggle';
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
 * VOICE (13 Sep 2026, plan 2.18)
 *   A mic in the prompt bar: what was heard lands in the box, the person
 *   reads it and sends - never straight to a send. A speaker on every answer
 *   reads it aloud in the browser's Hindi/English voice. Both for the
 *   shopkeeper who would rather talk than type; neither costs a call beyond
 *   the transcription itself.
 *
 * The thread lives in this component only. Nothing is stored in the
 * browser; the server keeps a 90-day log for the admin.
 */
/* Starter chips in the chosen language - the first thing a new person taps. */
const STARTERS = {
  seller: {
    hi: ['मेरा पेमेंट कब आएगा और कितना?', 'कौन से प्रोडक्ट पहले ठीक करूँ?', 'ग्राहक कह रहा है पार्सल नहीं मिला - क्या करूँ?', 'ऑर्डर रद्द करने पर क्या चार्ज लगता है, और क्यों?', 'मेरे प्रोडक्ट Google पर कैसे दिखेंगे?'],
    hg: ['Mera payment kab aayega aur kitna?', 'Kaunse products pehle theek karun?', 'Customer bol raha hai parcel nahi mila - kya karun?', 'Cancel karne pe kya charge lagta hai, aur kyun?', 'Mere products Google pe kaise dikhenge?'],
    en: ['When is my next payout, and how much?', 'Which of my listings need fixing first?', 'A customer says the parcel never came - what do I do?', 'What does cancelling an order cost, and why?', 'How do I get my products on Google?'],
  },
  admin: {
    hi: ['इस हफ्ते मुझे क्या तय करना है?', 'Charming Jewels का प्रदर्शन कैसा है?', 'कौन से विक्रेता cancel-rate की सीमा के पास हैं?', 'dispute खुला हो तो payout hold कैसे काम करता है?'],
    hg: ['Is weekend mujhe kya decide karna hai?', 'Charming Jewels ka performance kaisa chal raha hai?', 'Kaunse sellers cancel-rate limit ke paas hain?', 'Dispute open ho to payout hold kaise kaam karta hai?', 'Cutover plan me abhi kya bacha hai?'],
    en: ['What needs my decision this weekend?', 'How is Charming Jewels performing?', 'Which sellers are close to the cancel-rate limit?', 'How does the payout hold work when a dispute is open?', 'What is left in the cutover plan?'],
  },
  customer: {
    hi: ['मेरा आखिरी ऑर्डर कहाँ है?', 'मेरा रिफ़ंड कब तक आएगा?', 'वापसी और बदली कैसे होती है?', 'कूरियर कहता है पहुँच गया, पर मुझे कुछ नहीं मिला।'],
    hg: ['Mera last order kahan hai?', 'Mera refund kab tak aayega?', 'Return aur exchange kaise hota hai?', 'Courier bolta hai deliver ho gaya, par mujhe kuch nahi mila.'],
    en: ['Where is my last order?', 'When will my refund arrive?', 'How do returns and exchanges work?', 'The courier says delivered but I have nothing.'],
  },
};

const ROUTE = { seller: '/seller/assist', admin: '/admin/assist', customer: '/customer/assist' };

export default function AskPanel({ role = 'seller', compact = false }) {
  const t = useT();
  const lang = useLang();
  const [thread, setThread] = useState([]);
  const [speaking, setSpeaking] = useState(null); // index of the answer being read
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread, busy]);

  useEffect(() => () => stopSpeaking(), []);

  const readAloud = (i, text) => {
    if (speaking === i) {
      stopSpeaking();
      setSpeaking(null);
      return;
    }
    if (speak(text, { lang })) {
      setSpeaking(i);
      const done = () => setSpeaking(null);
      // speechSynthesis has no promise; poll until it stops talking.
      const tick = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          clearInterval(tick);
          done();
        }
      }, 400);
    }
  };

  const heard = (text) => {
    setDraft((d) => (d ? `${d} ${text}` : text));
    inputRef.current?.focus();
  };

  const send = async (text) => {
    const q = String(text || draft).trim();
    if (!q || busy) return;
    setDraft('');
    const history = thread.filter((m) => m.text).map((m) => ({ role: m.role, text: m.text }));
    setThread((tq) => [...tq, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const r = await authedFetch(ROUTE[role], { method: 'POST', body: { question: q, history, language: lang } });
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

  const starters = STARTERS[role]?.[lang] || STARTERS[role]?.en || [];

  return (
    <div className={`flex flex-col rounded-xl border bg-card ${compact ? 'max-h-[70vh]' : 'min-h-[60vh] max-h-[78vh]'}`}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-xs text-muted-foreground">{t('Language')}</span>
        <LangToggle label={t('Language')} />
      </div>
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
                      <button type="button" onClick={() => readAloud(i, m.text)} aria-label={speaking === i ? t('Stop reading') : t('Read aloud')} className={`inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted ${speaking === i ? 'text-brand-ink' : ''}`}>
                        {speaking === i ? <VolumeX className="size-3.5" aria-hidden /> : <Volume2 className="size-3.5" aria-hidden />}
                        {t('Listen')}
                      </button>
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
          <MicButton role={role} language={lang} onText={heard} label={t('Speak your question')} />
          <button type="submit" disabled={busy || !draft.trim()} aria-label={t('Send')} className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-ink text-white disabled:opacity-40">
            <Send className="size-4" aria-hidden />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">{t('Tap the mic and speak in Hindi or English - check the words, then send.')} {t('Answers come from your data and the rules; check anything about money on the page itself. Nothing you type is shared with other sellers.')}</p>
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
