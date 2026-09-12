import AiStudio from '@/components/ai/AiStudio';

export const metadata = { title: 'AI Studio' };

export default function SellerAiPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">AI Studio</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Every model you can use on your photos and listings, what each can do, and what is left today.
      </p>
      <AiStudio base="/seller" />
    </>
  );
}
