'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiBase } from '@/lib/api';
import { getToken } from '@/lib/session';

/**
 * The mic, once, for every place that has one - Ask ShopMaster, the search
 * bar, the product form.
 *
 * HOW
 *   MediaRecorder records the mic (webm/opus on Chrome and Android, mp4 on
 *   iPhone - whichever the browser offers), the clip goes to
 *   /:role/voice/transcribe as a data URL, the text comes back. Hard stop at
 *   60 seconds; the shopkeeper's questions are ten.
 *
 * WHY THE TEXT LANDS IN THE BOX, NOT STRAIGHT INTO A SEND
 *   Google's search mic does the same: you see what it heard, then you go.
 *   Whisper is good at Hindi and imperfect at Hinglish, and a wrong word in
 *   an order number is worse than one more tap.
 *
 * WHY IT STOPS BY ITSELF
 *   Rajat's first try (13 Sep): spoke, waited, nothing - the red button was
 *   waiting to be tapped again. Google's mic stops when you go quiet, and
 *   that is what people expect. An AnalyserNode watches the level; once
 *   speech has been heard, 1.6 s of quiet ends the clip. The tap still works
 *   for the impatient; the 60 s cap still holds for the noisy room.
 *
 * `speak(text)` is the other direction - the browser's own Hindi voice
 * (speechSynthesis), no API, no quota, works offline. Cancel on unmount so a
 * page change does not keep talking.
 */
const MAX_MS = 60000;
const SILENCE_MS = 1600; // quiet this long after speech ends the clip
const LEVEL_SPEECH = 0.02; // RMS above this counts as talking (0..1)

const pickMime = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
};

export const voiceSupported = () =>
  typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext;

/**
 * @param {{ role: 'seller'|'admin'|'customer'|'public', language?: 'hi'|'hg'|'en'|'auto', onText: (text:string)=>void }} opts
 *   language follows the site's chip: hi → Devanagari, hg → Hinglish in roman
 *   letters (the server transliterates), en → English, auto → detect.
 */
export function useVoice({ role, language = 'auto', onText }) {
  const [state, setState] = useState('idle'); // idle | recording | sending | error
  const [error, setError] = useState('');
  // Decided after mount, never during render: the server has no MediaRecorder
  // and the client does, and a mic that exists in one and not the other is a
  // hydration mismatch.
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capability, known only after mount
    setSupported(voiceSupported());
  }, []);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const audioRef = useRef(null); // { ctx, raf }
  const [level, setLevel] = useState(0);

  const cleanup = () => {
    clearTimeout(timerRef.current);
    if (audioRef.current) {
      cancelAnimationFrame(audioRef.current.raf);
      audioRef.current.ctx.close().catch(() => {});
      audioRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
    setLevel(0);
  };

  const send = useCallback(
    async (blob) => {
      setState('sending');
      try {
        const dataUrl = await new Promise((ok, no) => {
          const r = new FileReader();
          r.onload = () => ok(r.result);
          r.onerror = () => no(new Error('Could not read the recording'));
          r.readAsDataURL(blob);
        });
        const token = getToken();
        const path = role === 'public' || !token ? '/public/voice/transcribe' : `/${role}/voice/transcribe`;
        const res = await fetch(`${apiBase}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token && role !== 'public' ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ audio: dataUrl, language }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Could not hear that - try again');
        setState('idle');
        onText?.(data.text || '');
      } catch (e) {
        setError(e.message);
        setState('error');
      }
    },
    [role, language, onText]
  );

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  const start = useCallback(async () => {
    if (!voiceSupported()) {
      setError('This browser cannot record - try Chrome, or type instead');
      setState('error');
      return;
    }
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || 'audio/webm' });
        cleanup();
        if (blob.size < 2000) {
          setError('Nothing was heard - hold the mic and speak');
          setState('error');
          return;
        }
        send(blob);
      };
      recRef.current = rec;
      rec.start();
      setState('recording');
      timerRef.current = setTimeout(stop, MAX_MS);

      // Silence detection. Not every browser has AudioContext on this path
      // (old WebViews); then the tap and the cap are the only ends.
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        src.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        let spoke = false;
        let quietSince = 0;
        const tick = () => {
          if (!recRef.current || recRef.current.state === 'inactive') return;
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          // A render only when the ring would visibly move, not sixty a second.
          const lv = Math.round(Math.min(1, rms * 8) * 10) / 10;
          setLevel((prev) => (prev === lv ? prev : lv));
          const now = performance.now();
          if (rms > LEVEL_SPEECH) {
            spoke = true;
            quietSince = 0;
          } else if (spoke) {
            if (!quietSince) quietSince = now;
            else if (now - quietSince > SILENCE_MS) {
              stop();
              return;
            }
          }
          audioRef.current = { ctx, raf: requestAnimationFrame(tick) };
        };
        audioRef.current = { ctx, raf: requestAnimationFrame(tick) };
      } catch {
        /* no analyser: tap to stop */
      }
    } catch (e) {
      cleanup();
      setError(e.name === 'NotAllowedError' ? 'Allow the microphone in the browser, then try again' : e.message);
      setState('error');
    }
  }, [send, stop]);

  const toggle = useCallback(() => (state === 'recording' ? stop() : state === 'sending' ? undefined : start()), [state, start, stop]);

  useEffect(() => () => cleanup(), []);

  return { state, error, level, start, stop, toggle, supported };
}

/**
 * Read text aloud in the browser's own voice. hi and hg both get the Hindi
 * voice - roman Hinglish read by an English voice sounds like a tourist; the
 * Hindi voice reads it the way it is meant. Devanagari in the text wins
 * regardless.
 */
export const speak = (text, { lang } = {}) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false;
  const clean = String(text || '')
    .replace(/[*_`#>|]/g, ' ')
    .replace(/\/[\w\-/?=&.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);
  if (!clean) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  const hindi = lang === 'hi' || lang === 'hg' || /[ऀ-ॿ]/.test(clean);
  u.lang = hindi ? 'hi-IN' : 'en-IN';
  const voices = window.speechSynthesis.getVoices();
  const match = voices.find((v) => v.lang === u.lang) || voices.find((v) => v.lang.startsWith(hindi ? 'hi' : 'en'));
  if (match) u.voice = match;
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
  return true;
};

export const stopSpeaking = () => {
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
};
