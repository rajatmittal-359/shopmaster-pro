import Overview from '@/components/admin/Overview';

export const metadata = { title: 'Overview' };

export default function AdminHome() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Overview</h1>
      <Overview />
    </>
  );
}
