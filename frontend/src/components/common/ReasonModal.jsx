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
  onSubmit,
  onClose,
}) {
  const [reason, setReason] = useState('');

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
    if (open) setReason('');
  }

  const tooShort = reason.trim().length < minLength;

  return (
    <Modal open={open} title={title} hint={hint} onClose={onClose}>
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
          onClick={() => onSubmit(reason.trim())}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
