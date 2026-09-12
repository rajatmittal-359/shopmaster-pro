'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { useSession } from '@/lib/session';
import ActionDialog from '@/components/common/ActionDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * Writing, changing or removing your own review of a product.
 *
 * THE SHAPE, FROM THE REFERENCES (12 Sep 2026)
 *   Flipkart: "Rate this product" - five stars that each carry a word
 *   (Very bad … Excellent), then a title and a description, and only
 *   verified buyers see it at all. Amazon: the same order - overall rating
 *   first, headline, body - with the rating alone enough to submit. So: the
 *   stars are required and named; the words are optional; the button says
 *   what it does.
 *
 * THE SERVER DECIDES WHO SEES IT
 *   `GET /reviews/product/:id/mine` answers whether this customer received
 *   the product (same lookup the POST refuses with) and returns their review
 *   if they wrote one. No form is drawn that the API would then refuse; and
 *   somebody who never bought it sees nothing here - the sentence above the
 *   reviews already says why.
 *
 * WHY THIS IS A CLIENT ISLAND ON A SERVER PAGE
 *   The product page is server-rendered for Google and stays that way. This
 *   is the one piece that depends on who is looking, so it mounts on its own
 *   and asks. After a save it calls router.refresh() so the server-rendered
 *   list and the rating bars above it update without a reload.
 */
const WORDS = { 1: 'Very bad', 2: 'Bad', 3: 'Okay', 4: 'Very good', 5: 'Excellent' };

export default function ReviewForm({ productId }) {
  const router = useRouter();
  const { signedIn } = useSession();
  const [status, setStatus] = useState(null); // { canReview, reason, review }
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ rating: 0, title: '', comment: '' });
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);
  const [askingDelete, setAskingDelete] = useState(false);

  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;
    authedFetch(`/reviews/product/${productId}/mine`)
      .then((data) => {
        if (cancelled) return;
        setStatus(data);
        if (data.review) {
          setForm({ rating: data.review.rating, title: data.review.title || '', comment: data.review.comment || '' });
        }
      })
      .catch(() => {
        // A seller or admin account gets 403 here; they are not customers of
        // this product and the section simply stays as the server drew it.
        if (!cancelled) setStatus({ canReview: false, reason: 'not_customer', review: null });
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, productId]);

  if (!signedIn) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        Bought this?{' '}
        <Link href={`/login?next=/products/${productId}#reviews`} className="text-brand-ink hover:underline">
          Sign in
        </Link>{' '}
        to write a review once it has been delivered.
      </p>
    );
  }

  if (!status || !status.canReview) return null;

  const save = async (e) => {
    e.preventDefault();
    if (!form.rating) {
      toast.error('Pick a star rating first.');
      return;
    }
    setBusy(true);
    try {
      const data = await authedFetch(`/reviews/product/${productId}`, {
        method: 'POST',
        body: { rating: form.rating, title: form.title.trim(), comment: form.comment.trim() },
      });
      setStatus({ ...status, review: data.review });
      setEditing(false);
      toast.success(status.review ? 'Review updated' : 'Thank you - your review is up');
      router.refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await authedFetch(`/reviews/${status.review._id}`, { method: 'DELETE' });
      setStatus({ ...status, review: null });
      setForm({ rating: 0, title: '', comment: '' });
      setEditing(false);
      toast.success('Review removed');
      router.refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Their review, as written - with the two things they can still do to it.
  if (status.review && !editing) {
    return (
      <div className="mt-4 rounded-xl border bg-card p-4">
        <p className="text-sm font-medium">Your review</p>
        <div className="mt-1 flex items-center gap-2">
          <StarRow value={status.review.rating} />
          <span className="text-sm text-muted-foreground">{WORDS[status.review.rating]}</span>
        </div>
        {status.review.title && <p className="mt-2 text-sm font-medium">{status.review.title}</p>}
        {status.review.comment && <p className="mt-1 text-sm text-muted-foreground">{status.review.comment}</p>}
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => setAskingDelete(true)}>Remove</Button>
        </div>
        <ActionDialog
          open={askingDelete}
          onOpenChange={setAskingDelete}
          title="Remove your review"
          description="It comes off the product and out of its rating. You can write a new one later."
          destructive
          confirmLabel="Remove it"
          busy={busy}
          onConfirm={() => {
            setAskingDelete(false);
            remove();
          }}
        />
      </div>
    );
  }

  const shown = hover || form.rating;

  return (
    <form onSubmit={save} className="mt-4 rounded-xl border bg-card p-4">
      <p className="text-sm font-medium">{status.review ? 'Change your review' : 'Rate this product'}</p>

      <div className="mt-2 flex items-center gap-3">
        <div role="radiogroup" aria-label="Your rating" className="flex" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={form.rating === n}
              aria-label={`${n} star${n === 1 ? '' : 's'} - ${WORDS[n]}`}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(0)}
              onClick={() => setForm({ ...form, rating: n })}
              className="rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Star filled={n <= shown} />
            </button>
          ))}
        </div>
        <span className="min-w-20 text-sm text-muted-foreground" aria-live="polite">
          {shown ? WORDS[shown] : 'Tap a star'}
        </span>
      </div>

      <div className="mt-4 grid gap-4">
        <div>
          <Label htmlFor="review-title">Title <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input
            id="review-title"
            className="mt-1.5"
            maxLength={100}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Sum it up in a few words"
          />
        </div>
        <div>
          <Label htmlFor="review-comment">What was it like? <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea
            id="review-comment"
            className="mt-1.5"
            rows={4}
            maxLength={1000}
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
            placeholder="Fit, finish, how it looked on, whether it matched the photos"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Shown with your name and a “Verified purchase” label. The seller reads it too.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" disabled={busy || !form.rating}>
          {busy ? 'Saving…' : status.review ? 'Save changes' : 'Post review'}
        </Button>
        {status.review && (
          <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function Star({ filled }) {
  return (
    <svg viewBox="0 0 20 20" className="h-7 w-7" aria-hidden="true">
      <path
        d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L1.5 7.7l5.9-.9z"
        fill="currentColor"
        className={filled ? 'text-primary' : 'text-muted'}
      />
    </svg>
  );
}

function StarRow({ value }) {
  return (
    <span className="inline-flex" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 20 20" className="h-4 w-4">
          <path
            d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L1.5 7.7l5.9-.9z"
            fill="currentColor"
            className={n <= value ? 'text-primary' : 'text-muted'}
          />
        </svg>
      ))}
    </span>
  );
}
