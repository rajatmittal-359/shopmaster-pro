import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ConfirmContext } from './confirmContext';

/**
 * One confirmation dialog for the whole app.
 *
 * WHY NOT window.confirm
 *   Ten destructive actions used the browser's native confirm. It works, but it
 *   is unstyled, cannot be dismissed with a click outside, gives no way to
 *   emphasise that an action is destructive, and on some browsers can be
 *   suppressed entirely - which would silently turn "cancel this order?" into
 *   "order cancelled". A dialog the app owns is both clearer and predictable.
 *
 * HOW IT KEEPS THE CALL SITES SIMPLE
 *   Opening the dialog stores the promise's resolver. Choosing an answer calls
 *   it, so the caller can simply await:
 *
 *       if (!(await confirm({ title: 'Cancel this order?' }))) return;
 *
 *   That is the same shape as the code it replaces, so the handlers barely
 *   change and the intent stays obvious.
 */
export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback(
    (options = {}) =>
      new Promise((resolve) => {
        resolverRef.current = resolve;
        setRequest({
          title: options.title || 'Are you sure?',
          message: options.message || null,
          confirmLabel: options.confirmLabel || 'Yes, continue',
          cancelLabel: options.cancelLabel || 'Go back',
          danger: options.danger !== false,
        });
      }),
    []
  );

  const settle = useCallback((answer) => {
    setRequest(null);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    if (resolve) resolve(answer);
  }, []);

  // Escape always means "no". A dialog you cannot dismiss is a trap.
  useEffect(() => {
    if (!request) return undefined;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') settle(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [request, settle]);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}

      {request && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          onClick={() => settle(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
            // A click inside must not count as dismissing it.
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="text-lg font-semibold text-gray-900">
              {request.title}
            </h2>

            {request.message && (
              <p className="mt-2 text-sm text-gray-600">{request.message}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => settle(false)}
                className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {request.cancelLabel}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => settle(true)}
                className={`rounded px-4 py-2 text-sm text-white ${
                  request.danger
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                {request.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
