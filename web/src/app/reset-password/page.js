import ResetPasswordForm from '@/components/auth/ResetPasswordForm';

export const metadata = { title: 'Set a new password', robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ searchParams }) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
      <div className="mt-6">
        <ResetPasswordForm token={token || ''} />
      </div>
    </div>
  );
}
