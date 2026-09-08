'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * When a page throws.
 *
 * WHY IT SAYS SO LITTLE
 *   The person reading this cannot fix it and does not want a stack trace. What
 *   they need is: it is us, not you; try again; and here is the way back. The
 *   old React app had an ErrorBoundary for the same reason - Next's convention
 *   replaces it, and this is that file.
 *
 * WHY THE RETRY BUTTON MATTERS
 *   Most of these are a failed API call - Render's free instance waking up, or
 *   Singapore blinking. `reset()` re-renders the segment without a full reload,
 *   so the second attempt usually works and the person never leaves.
 *
 * WHAT IT DOES NOT DO
 *   It does not show `error.message`. Those come from the server and can carry
 *   internal detail; the digest is enough to find it in the logs, and it is the
 *   one thing worth quoting to us.
 */
export default function Error({ error, reset }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">That did not load</h1>
      <p className="mt-2 text-muted-foreground">
        Something on our side broke - not anything you did. Trying again usually
        works.
      </p>

      <div className="mt-6 flex justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/shop">Back to the shop</Link>
        </Button>
      </div>

      {error?.digest && (
        <p className="mt-6 text-xs text-muted-foreground">
          If you tell us about this, quote {error.digest}.
        </p>
      )}
    </div>
  );
}
