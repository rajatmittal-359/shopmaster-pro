import { Skeleton } from '@/components/ui/skeleton';

/**
 * What the shop looks like while it is being fetched.
 *
 * WHY A SKELETON AND NOT A SPINNER
 *   A spinner draws attention to the WAITING. A skeleton draws attention to the
 *   content that is about to arrive, and that shift is the whole effect: people
 *   rate the same wait as substantially shorter. It only works inside a
 *   window, though - roughly 400ms to 3 seconds. Faster than that and the
 *   flash is worse than nothing, which is why every piece of this starts
 *   invisible for 300ms (see `.skeleton-in`).
 *
 * WHY IT MIRRORS THE REAL PAGE EXACTLY
 *   Same heading position, same 13rem filter column, same four-up grid, same
 *   square image ratio. A skeleton that does not map to what follows is just
 *   grey boxes moving about, and the layout shift when the real content lands
 *   undoes the effect it was there to create.
 *
 * WHY IT MATTERS HERE MORE THAN ANYWHERE ELSE
 *   This page waits on THREE calls - products, filters and categories - to an
 *   API in Singapore that can be cold. It is the longest wait on the site.
 */
export default function ShopLoading() {
  return (
    <div className="skeleton-in mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-2 h-4 w-24" />
      </header>

      <div className="grid gap-8 md:grid-cols-[13rem_1fr]">
        {/* The filter column. Hidden below md, exactly as the real one is. */}
        <div className="hidden space-y-6 md:block">
          {[0, 1, 2].map((group) => (
            <div key={group}>
              <Skeleton className="h-4 w-20" />
              <div className="mt-3 space-y-2">
                {[0, 1, 2, 3].map((row) => (
                  <Skeleton key={row} className="h-3.5 w-full max-w-32" />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-9 w-36" />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {/* Eight, not twenty-four. Nobody is waiting to see row six, and
                every extra one is another node to build and throw away. */}
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border">
                <Skeleton className="aspect-square rounded-none" />
                <div className="space-y-2 p-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
