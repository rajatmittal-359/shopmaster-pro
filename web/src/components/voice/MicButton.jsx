'use client';

import { Mic, Square, Loader2 } from 'lucide-react';
import { useVoice } from '@/lib/voice';

/**
 * One mic button: tap to record, tap to stop, the text arrives in onText.
 * Red pulse while recording (the Google / WhatsApp convention - unmistakable
 * on a phone), spinner while it is being heard, the error as a title and a
 * small line under it when there is one.
 */
export default function MicButton({ role, language = 'auto', onText, size = 'md', shape = 'square', className = '', label = 'Speak' }) {
  const { state, error, toggle, supported } = useVoice({ role, language, onText });
  if (!supported) return null;
  const dim = size === 'sm' ? 'size-7' : 'size-10';
  const radius = shape === 'round' ? 'rounded-full' : 'rounded-lg';
  const icon = size === 'sm' ? 'size-4' : 'size-4';
  const recording = state === 'recording';
  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={recording}
        aria-label={recording ? 'Stop and send' : label}
        title={state === 'error' ? error : recording ? 'Tap to stop' : label}
        className={`grid ${dim} shrink-0 place-items-center ${radius} ${shape === 'round' ? '' : 'border'} transition-colors ${
          recording ? 'border-red-500 bg-red-500 text-white' : state === 'error' ? 'border-destructive/50 text-destructive' : `${shape === 'round' ? '' : 'bg-background'} text-muted-foreground hover:bg-accent hover:text-foreground`
        }`}
      >
        {state === 'sending' ? <Loader2 className={`${icon} animate-spin`} aria-hidden /> : recording ? <Square className={icon} aria-hidden /> : <Mic className={icon} aria-hidden />}
      </button>
      {recording && <span className={`pointer-events-none absolute -inset-1 animate-ping ${radius} border-2 border-red-500/60`} aria-hidden />}
    </span>
  );
}
