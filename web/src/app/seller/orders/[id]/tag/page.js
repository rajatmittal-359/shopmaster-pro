import ReturnTag from '@/components/seller/ReturnTag';

export const metadata = { title: 'Return tags' };

export default async function ReturnTagPage({ params }) {
  const { id } = await params;
  return <ReturnTag orderId={id} />;
}
