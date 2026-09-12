import Studio from '@/components/ai/Studio';

export const metadata = { title: 'AI Studio' };

export default function AdminAiStudioPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">AI Studio</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Drop a product photo, say what you want, pick a model - the limits are written on the chip.
      </p>
      <Studio base="/admin" />
    </>
  );
}
