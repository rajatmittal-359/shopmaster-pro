'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n';

/**
 * Say it or type it - the seller's own words, in their own language.
 *
 * WHY (27 Sep 2026, Rajat's idea, and it is a better one than mine)
 *   I was correcting the seller one chip at a time: they type a word, we
 *   check it against words we already have evidence for, we offer a near
 *   miss. That only ever helps with a word we already knew - Rajat tested it
 *   with "artifcial" and got nothing, and asked the right question: "ab AI
 *   kaha hai?"
 *
 *   His answer: *"Ek input box hi de do. Jo bolna chahega bol dega, usse phir
 *   search keywords generate ho jaenge... khud bolna hai to AI usme se theek
 *   karke suggest kar dega. Likhne ka bolne ka dono ho."*
 *
 *   That inverts it, and it is right. Instead of policing single words, take
 *   the whole sentence - Hindi, Hinglish, misspelt, whatever comes out - and
 *   let the model read what was MEANT. A seller who cannot spell "artificial"
 *   can still say "artificial jewellery ka necklace set hai, shaadi me pehnte
 *   hain", and every word in that is knowledge we do not have.
 *
 * SPEAKING, WITHOUT A NEW KEY OR A NEW BILL
 *   The browser's own SpeechRecognition (Chrome on Android and desktop) does
 *   Hindi and Indian English for free, with no account and nothing sent to a
 *   service of ours. Sarvam, the paid Hindi voice option, stays parked - this
 *   removes the reason to reach for it. Where the browser has no support the
 *   microphone simply is not drawn and typing still works; nothing here is
 *   the only way in.
 *
 *   `hi-IN` is deliberate over `en-IN`: Chrome's Hindi model transcribes
 *   Hinglish spoken by a Hindi speaker better than the English one does, and
 *   Mummy speaks Hindi.
 */
export default function SayIt({ value, onChange, busy, onSubmit }) {
  const t = useT();
  const [listening, setListening] = useState(false);
  const [canHear, setCanHear] = useState(false);
  const recognition = useRef(null);
  const base = useRef('');

  useEffect(() => {
    const Engine = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!Engine) return undefined;
    const r = new Engine();
    r.lang = 'hi-IN';
    r.continuous = true;
    // Interim results so the words appear while they are still being spoken -
    // silence for four seconds reads as "it is not working" and people stop.
    r.interimResults = true;
    r.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += `${e.results[i][0].transcript} `;
      onChange(`${base.current}${base.current ? ' ' : ''}${text}`.replace(/\s+/g, ' ').trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r;
    // The microphone is drawn only once we know the browser can listen. Set
    // from a microtask, never synchronously in the effect body - this repo
    // has react-hooks/set-state-in-effect on, and it is right to.
    queueMicrotask(() => setCanHear(true));
    return () => {
      try {
        r.stop();
      } catch {
        /* already stopped */
      }
    };
    // onChange is stable enough here; re-creating the engine mid-sentence
    // would drop what is being said.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const r = recognition.current;
    if (!r) return;
    if (listening) {
      r.stop();
      setListening(false);
      return;
    }
    // Whatever is already typed is kept; speaking adds to it.
    base.current = value || '';
    try {
      r.start();
      setListening(true);
    } catch {
      /* start() throws if it is already running */
    }
  };

  return (
    <div className="mt-3">
      <p className="text-sm font-medium">{t('Or tell us in your own words')}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t('Hindi, Hinglish, anything - spelling does not matter. Say what it is, what it is made of, and when people wear it.')}
      </p>
      <div className="mt-2 flex items-start gap-2">
        <Textarea
          id="sayit"
          rows={2}
          value={value}
          maxLength={500}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('green kundan ka necklace set hai, shaadi aur festival me pehnte hain, meena work hai')}
          className="flex-1"
        />
        {canHear && (
          <button
            type="button"
            onClick={toggle}
            aria-label={listening ? t('Stop') : t('Speak')}
            aria-pressed={listening}
            className={`grid size-10 shrink-0 place-items-center rounded-full border transition ${
              listening ? 'animate-pulse border-destructive bg-destructive/10 text-destructive' : 'hover:bg-accent'
            }`}
          >
            {listening ? <Square className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || !String(value || '').trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {t('Make search words from this')}
        </button>
        {listening && <span className="text-xs text-destructive">{t('Listening… speak now, then press stop.')}</span>}
      </div>
    </div>
  );
}
