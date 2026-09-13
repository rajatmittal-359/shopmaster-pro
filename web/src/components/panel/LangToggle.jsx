'use client';

import { useLang, setLang, LANGS } from '@/lib/i18n';

/**
 * हिंदी | Hinglish | English - the one language chip, wherever language
 * matters (panel bar, Ask ShopMaster, the mic). Remembered on this device;
 * every consumer reads the same choice through useLang().
 *
 * `compact` shows the short labels (हिं · Hinglish · EN) for a tight bar.
 */
export default function LangToggle({ compact = false, className = '', label = 'Language' }) {
  const lang = useLang();
  return (
    <div role="group" aria-label={label} className={`flex rounded-full border bg-muted p-0.5 text-xs ${className}`}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          title={l.name}
          className={`rounded-full px-2.5 py-1 font-medium transition ${lang === l.code ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {compact ? l.short : l.label}
        </button>
      ))}
    </div>
  );
}
