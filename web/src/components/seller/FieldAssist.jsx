'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * The sparkle beside one field - Shopify Magic's shape.
 *
 * The seller wrote something: in Hindi, in Hinglish, in rushed English. This
 * makes THAT better without touching the rest of the form: polish it,
 * translate it, shorten it, add a little detail. What was there before comes
 * back with one tap on Undo - a rewrite you cannot reverse is a rewrite
 * nobody dares press.
 */
const ACTIONS = [
  { id: 'polish', label: 'Fix & polish', hint: 'Spelling, grammar, flow - same facts' },
  { id: 'translate', label: 'Translate to English', hint: 'From Hindi, Hinglish or any language' },
  { id: 'shorten', label: 'Make it shorter', hint: 'About half the length' },
  { id: 'detail', label: 'Add a little detail', hint: 'When and with what it is used - nothing invented', descriptionOnly: true },
];

export default function FieldAssist({ field, value, onChange, context = {}, textModel = 'auto', base = '/seller', className = '' }) {
  const [busy, setBusy] = useState(null);
  const empty = !String(value || '').replace(/<[^>]*>/g, '').trim();

  const run = async (action) => {
    setBusy(action.id);
    const before = value;
    try {
      const data = await authedFetch(`${base}/ai/refine`, {
        method: 'POST',
        body: { field, action: action.id, text: value, name: context.name, categoryName: context.categoryName, textModel },
      });
      onChange(data.text);
      toast.success(`${action.label} - done`, {
        description: [`Written by ${data.writtenBy}.`, ...(data.warnings || [])].join(' '),
        action: { label: 'Undo', onClick: () => onChange(before) },
      });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={Boolean(busy)}
        aria-label={`Improve the ${field === 'name' ? 'title' : 'description'} with AI`}
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-brand-ink hover:bg-accent disabled:opacity-50 ${className}`}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {busy ? 'Working…' : 'Improve'}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {empty ? 'Write something first - any language.' : 'Rewrites only this field. Undo is on the toast.'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACTIONS.filter((a) => !a.descriptionOnly || field === 'description').map((a) => (
          <DropdownMenuItem key={a.id} disabled={empty} onClick={() => run(a)}>
            <span className="flex flex-col">
              <span>{a.label}</span>
              <span className="text-xs text-muted-foreground">{a.hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
