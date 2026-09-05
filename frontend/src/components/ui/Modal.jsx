/**
 * A dialog for a short, deliberate task.
 *
 * WHEN TO USE ONE, AND WHEN NOT TO
 *   Not for anything contextual. Adding a subcategory belongs on the parent's
 *   own row, because the parent is the context and a dialog would only put a
 *   step between the click and the typing.
 *
 *   A dialog earns its place when the task has several fields and no natural
 *   home in the list - creating a main category with its first subcategories,
 *   for instance. Inline, that form pushes the whole table down and you lose
 *   your place in it.
 *
 * The behaviour here matches ConfirmProvider, which is the app's existing
 * dialog: a dimmed backdrop, Escape to leave, and a click outside to dismiss.
 * A dialog you cannot get out of is a trap.
 */
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import Button from './Button';

export default function Modal({ open, title, hint, onClose, children }) {
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    // Stop the page behind scrolling while the dialog is over it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus in, so a keyboard user is inside the dialog rather than still
    // tabbing through the page underneath it.
    panel.current?.focus();

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 py-10 overflow-y-auto"
      // Clicking the backdrop leaves; clicking inside must not.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white rounded-lg shadow-xl w-full max-w-lg outline-none"
      >
        <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
          </div>
          <Button
            variant="ghost"
            className="px-2 py-1 shrink-0"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={16} />
          </Button>
        </header>

        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
