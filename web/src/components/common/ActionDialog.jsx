'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * Every action that needs confirming, and every action that needs a reason.
 *
 * WHAT IT REPLACED
 *   `window.prompt()` and `window.confirm()`, in nine places. Browser dialogs
 *   are unstyled, cannot be laid out, are blocked outright by some browsers,
 *   and on a phone they are a system sheet with a tiny single-line field - for
 *   text a seller is expected to write carefully because a customer will read
 *   it. They were mine, and they were the wrong answer.
 *
 * WHAT THE MARKET DOES, AND WHY IT IS SHAPED THIS WAY
 *   - **Named reasons first, free text second.** Flipkart's cancellation flow
 *     offers a list and a "my reason is not listed" box. A list is faster,
 *     survives being read six months later, and can be counted; free text
 *     alone produces "ok" and "not needed".
 *   - **The button says what it does.** Nielsen Norman: label a confirmation
 *     with a verb and a noun - "Cancel this order", not "OK" or "Yes". Vague
 *     labels make people map buttons to actions in their head, which is where
 *     the misclicks come from.
 *   - **No "Are you sure?".** It asks nothing useful; the dialog already says
 *     what will happen.
 *   - **Red only where it destroys something.** Everything red teaches people
 *     to ignore red.
 *
 * WHAT WAS KEPT FROM THE OLD REACT APP
 *   Its `ReasonModal` had two things worth keeping, and both survive here: a
 *   minimum length, because a one-word reason makes a dispute impossible to
 *   settle afterwards; and the line telling whoever is typing that the other
 *   side will read it. That line changes what people write.
 */
export default function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  /** Optional named reasons: ['Out of stock', 'Damaged in storage'] */
  reasons = [],
  /** When true the action cannot proceed without a reason. */
  requireReason = false,
  confirmLabel,
  destructive = false,
  busy = false,
  note,
  onConfirm,
}) {
  const [chosen, setChosen] = useState('');
  const [text, setText] = useState('');

  const OTHER = 'Something else';
  const needsText = chosen === OTHER || reasons.length === 0;
  const reason = needsText ? text.trim() : chosen;
  const blocked = requireReason && reason.length < 3;

  const close = () => {
    setChosen('');
    setText('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {reasons.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="sr-only">Reason</legend>
            {[...reasons, OTHER].map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-2.5 text-sm has-[:checked]:border-primary"
              >
                <input
                  type="radio"
                  name="reason"
                  checked={chosen === option}
                  onChange={() => setChosen(option)}
                />
                {option}
              </label>
            ))}
          </fieldset>
        )}

        {needsText && (
          <div>
            <label htmlFor="reason-text" className="text-sm font-medium">
              {reasons.length > 0 ? 'Tell them what happened' : 'Reason'}
            </label>
            <Textarea
              id="reason-text"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-1"
            />
          </div>
        )}

        {/* Kept from the old app: knowing it will be read changes what gets
            written, and a reason nobody can act on is worse than none. */}
        {note && <p className="text-xs text-muted-foreground">{note}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Never mind
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy || blocked}
            onClick={() => onConfirm(reason)}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
