import AiStudio from '@/components/ai/AiStudio';

export const metadata = { title: 'AI limits' };

export default function AdminAiPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Providers &amp; limits</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Every provider and model on the platform, the allowance behind each, and what is left today.
      </p>
      <AiStudio base="/admin" />
    </>
  );
}
