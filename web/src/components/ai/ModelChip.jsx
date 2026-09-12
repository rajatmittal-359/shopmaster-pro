'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Clock, Sparkles } from 'lucide-react';

/**
 * The model selector that lives INSIDE the prompt bar - Gemini's "Flash ▾",
 * Shopify's model menu. Not a settings page somewhere else: the choice sits
 * where the work happens.
 *
 * WHAT EACH ROW SAYS
 *   Name, provider, quality band, and - the part Rajat asked for - what is
 *   left today or, when it is spent, WHY and WHEN it comes back. A spent model
 *   is shown and disabled, never hidden: a menu that quietly loses options is
 *   a menu that looks broken.
 *
 * "Automatic" is first and default. It is the tiered chain on the server:
 * best available answers, and falls back if one is spent mid-request.
 */
const QUALITY_DOT = {
  best: 'bg-brand-from',
  high: 'bg-primary',
  good: 'bg-emerald-500',
  basic: 'bg-muted-foreground',
};

export default function ModelChip({ models, value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const current = value === 'auto' ? null : models.find((m) => m.id === value);
  const label = current ? current.label : 'Automatic';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-full border bg-background px-3 text-sm font-medium hover:bg-accent disabled:opacity-50"
      >
        <Sparkles className="size-3.5 text-brand-ink" />
        {label}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 bottom-full z-50 mb-2 w-80 overflow-hidden rounded-xl border bg-popover py-1 shadow-lg"
        >
          <li>
            <button
              type="button"
              role="option"
              aria-selected={value === 'auto'}
              onClick={() => {
                onChange('auto');
                setOpen(false);
              }}
              className={`flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent ${value === 'auto' ? 'bg-accent/60' : ''}`}
            >
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-gradient-to-br from-brand-from to-brand-to" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Automatic</span>
                <span className="block text-xs text-muted-foreground">Best available answers; falls back if one is spent</span>
              </span>
              {value === 'auto' && <Check className="mt-1 size-4 text-brand-ink" />}
            </button>
          </li>
          <li className="my-1 border-t" />
          {models.map((m) => {
            const selected = m.id === value;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={!m.available}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent ${selected ? 'bg-accent/60' : ''}`}
                >
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${QUALITY_DOT[m.quality] || QUALITY_DOT.good}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5 text-sm font-medium">
                      {m.label}
                      <span className="text-[11px] font-normal text-muted-foreground">{m.providerLabel}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {m.available ? (
                        <>
                          <span className="capitalize">{m.quality}</span>
                          {' · '}
                          {m.unlimited ? 'unlimited' : m.remaining != null ? `${m.remaining} left today` : 'available'}
                        </>
                      ) : (
                        <span className="inline-flex items-start gap-1">
                          <Clock className="mt-0.5 size-3 shrink-0" />
                          {m.reason}
                        </span>
                      )}
                    </span>
                  </span>
                  {selected && <Check className="mt-1 size-4 text-brand-ink" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
