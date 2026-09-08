import { Skeleton } from '@/components/ui/skeleton';

/**
 * The product page while it is being fetched.
 *
 * Mirrors the real one: breadcrumb, the square gallery on the left, and the
 * buy column on the right in the order it actually appears - title, seller,
 * price, the delivery box, then the button. A skeleton that does not map to
 * what follows is just grey boxes moving about.
 *
 * Nothing here shows for the first 300ms. See `.skeleton-in`.
 */
export default function ProductLoading() {
  return (
    <div className="skeleton-in mx-auto max-w-5xl px-4 py-6 pb-28 md:pb-6">
      <Skeleton className="mb-4 h-4 w-56" />

      <div className="grid gap-8 md:grid-cols-2">
        <Skeleton className="aspect-square w-full rounded-xl" />

        <div className="space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-32" />
          </div>

          <div className="space-y-2">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-3.5 w-64" />
          </div>

          {/* The PIN-code box, which is a bordered panel on the real page. */}
          <div className="space-y-3 rounded-xl border p-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-9 w-full max-w-56" />
          </div>

          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />

          <div className="space-y-2 border-t pt-4">
            <Skeleton className="h-3.5 w-72" />
            <Skeleton className="h-3.5 w-64" />
          </div>
        </div>
      </div>
    </div>
  );
}
