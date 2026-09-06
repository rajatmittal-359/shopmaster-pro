import { useState } from 'react';

import Modal from '../ui/Modal';
import Button from '../ui/Button';

/**
 * "Tell us why" - the dialog behind every action that needs a reason on record.
 *
 * WHY IT IS SHARED
 *   Four places now ask for one: a customer returning goods or reporting a
 *   problem, a seller refusing a return, an admin deciding a dispute. Each
 *   reason ends up on the order and is read later by somebody who was not
 *   there - which only works if they are all collected the same way, with the
 *   same minimum, and the same warning that it will be shown to the other side.
 *
 *   The minimum is the point, not politeness. A one-word reason is what makes a
 *   dispute impossible to settle afterwards.
 */
export default function ReasonModal({
  open,
  title,
  hint,
  label,
  placeholder,
  note,
  confirmLabel,
  confirmVariant = 'primary',
  cancelLabel = 'Never mind',
  minLength = 3,
  busy = false,
  /**
   * An optional choice made alongside the reason - [{ value, label, hint }].
   *
   * WHY IT LIVES IN THIS DIALOG AND NOT BESIDE THE BUTTON
   *   A return is now two questions that have to be answered together: what is
   *   wrong with it, and do you want your money or the item again. Asked
   *   separately - two buttons, or a choice on the page behind - somebody can
   *   answer one and not the other, and the half-answer is what reaches the
   *   seller. Neither can be changed afterwards without a second return, so
   *   they are asked in one breath and sent in one request.
   */
  options = null,
  optionsLabel = '',
  onSubmit,
  onClose,
}) {
  const [reason, setReason] = useState('');
  const [choice, setChoice] = useState(options?.[0]?.value ?? null);

  /*
   * Clear the box each time this opens.
   *
   * A reason left over from the last time would be attached to a different
   * order, which is worse than an empty box. Done by adjusting state during
   * render rather than in an effect - React's own recommendation for "reset
   * when a prop changes", and it avoids the extra pass an effect costs.
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason('');
      // Back to the first option, which is the safe default everywhere this is
      // used: a stale choice from the last order is worse than no choice.
      setChoice(options?.[0]?.value ?? null);
    }
  }

  const tooShort = reason.trim().length < minLength;

  return (
    <Modal open={open} title={title} hint={hint} onClose={onClose}>
      {options?.length > 0 && (
        <fieldset className="mb-4">
          {optionsLabel && (
            <legend className="block text-sm text-gray-700 mb-2">{optionsLabel}</legend>
          )}
          <div className="space-y-2">
            {options.map((option) => (
              <label
                key={option.value}
                className={`flex gap-3 items-start rounded-lg border p-3 cursor-pointer
                            transition-colors ${
                              choice === option.value
                                ? 'border-brand-fill bg-brand-fill/5'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
              >
                <input
                  type="radio"
                  name="reason-modal-choice"
                  value={option.value}
                  checked={choice === option.value}
                  onChange={() => setChoice(option.value)}
                  className="mt-0.5 accent-brand-fill"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900">
                    {option.label}
                  </span>
                  {option.hint && (
                    <span className="block text-xs text-gray-500 mt-0.5">{option.hint}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label htmlFor="reason-modal-text" className="block text-sm text-gray-700 mb-1">
        {label}
      </label>
      <textarea
        id="reason-modal-text"
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-brand-fill"
      />
      {note && <p className="text-xs text-gray-500 mt-1">{note}</p>}

      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          variant={confirmVariant}
          disabled={tooShort}
          loading={busy}
          onClick={() => onSubmit(reason.trim(), choice)}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
