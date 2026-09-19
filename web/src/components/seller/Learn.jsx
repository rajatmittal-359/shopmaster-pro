'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { useLang } from '@/lib/i18n';
import { LESSONS } from '@/config/lessons';
import lessonAudio from '@/config/lessonAudio.json';

/**
 * सीखें - short lessons for the person who runs the shop day to day.
 *
 * Written for the person who runs the house shop day to day (13 Sep 2026):
 * a 1970s-generation shopkeeper on a phone, Hindi first, new to this. Each
 * lesson is the daily loop in five or six steps with the button that does
 * it - not a manual. English under the toggle for anyone else. Meesho's
 * supplier "Learn" and Amazon's Seller University do the same job with
 * videos; text loads on any phone.
 *
 * "सुन लो" (19 Sep 2026, plan 2.27): each lesson has a recording - Sarvam's
 * bulbul voice, generated once by backend/generateLessonAudio.js and kept
 * on Cloudinary; the manifest is config/lessonAudio.json. The text is the
 * same words, so a lesson can be heard while packing an order. No audio
 * file for a lesson → no button; nothing plays on its own.
 */

export default function Learn() {
  const lang = useLang();
  const lessons = LESSONS[lang] || LESSONS.en;
  const audio = lessonAudio[lang === 'hi' ? 'hi' : 'en'] || [];
  const [open, setOpen] = useState(0);

  return (
    <div className="space-y-3">
      {lessons.map((l, i) => (
        <section key={l.title} className="rounded-xl border bg-card">
          <button type="button" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i} className="flex w-full items-center gap-3 p-4 text-left">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-brand-ink">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold">{l.title}</span>
              <span className="block text-xs text-muted-foreground">{l.when}</span>
            </span>
            <ChevronDown className={`size-5 text-muted-foreground transition-transform ${open === i ? 'rotate-180' : ''}`} />
          </button>
          {open === i && (
            <div className="border-t px-4 pt-3 pb-4">
              {audio[i] && (
                <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 px-3 py-2">
                  <span className="text-sm font-medium">{lang === 'hi' ? 'सुन लो' : lang === 'hg' ? 'Sun lo' : 'Listen'}</span>
                  {/* preload="none": the file is fetched only when pressed - a lessons page must not pull six recordings on a phone plan. */}
                  <audio controls preload="none" src={audio[i]} className="h-9 max-w-full flex-1" aria-label={`${l.title} - audio`} />
                </div>
              )}
              <ol className="space-y-3">
                {l.steps.map(([step, note], j) => (
                  <li key={step} className="flex gap-3 text-[15px] leading-relaxed">
                    <span className="mt-1 size-5 shrink-0 rounded-full border text-center text-xs leading-[1.1rem] text-muted-foreground">{j + 1}</span>
                    <span>
                      {step}
                      {note && <span className="block text-sm text-muted-foreground">{note}</span>}
                    </span>
                  </li>
                ))}
              </ol>
              <Link href={l.href} className="mt-4 inline-block rounded-lg bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white">
                {l.cta} →
              </Link>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
