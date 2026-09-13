import MyReviews from '@/components/account/MyReviews';

export const metadata = { title: 'My reviews', robots: { index: false, follow: true } };

export default function MyReviewsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">My reviews</h1>
      <p className="mt-1 text-sm text-muted-foreground">What you said about what you bought. Every one is from a delivered order.</p>
      <div className="mt-6">
        <MyReviews />
      </div>
    </div>
  );
}
