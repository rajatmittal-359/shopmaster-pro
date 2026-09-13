'use client';

import { useLang, setLang } from '@/lib/i18n';

/** हिं | EN in the seller panel's bar. Remembered on this device. */
export default function LangToggle() {
  const lang = useLang();
  return (
    <div role="group" aria-label="Language" className="flex rounded-full border bg-muted p-0.5 text-xs">
      {[
        ['hi', 'हिं'],
        ['en', 'EN'],
      ].map(([code, label]) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={`rounded-full px-2.5 py-1 font-medium transition ${lang === code ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
