import Link from 'next/link';
import { getSettings } from '@/lib/api';

/**
 * One line above the header, when the admin switched it on (Settings →
 * Announcement bar). Festival offer, holiday notice, "same-day in Jaipur
 * this week". Server-rendered, five-minute cache; nothing when off.
 */
export default async function AnnouncementBar() {
  const settings = await getSettings();
  const a = settings?.announcement;
  if (!a?.enabled || !a.text || a.audience === 'sellers') return null;
  const inner = <span className="mx-auto block max-w-5xl px-4 py-1.5 text-center text-xs font-medium sm:text-sm">{a.text}</span>;
  return (
    <div className="bg-brand-ink text-white">
      {a.href ? (
        <Link href={a.href} className="block hover:bg-white/10">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </div>
  );
}
