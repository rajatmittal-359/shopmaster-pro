import ResetPasswordForm from '@/components/auth/ResetPasswordForm';
import AuthShell from '@/components/auth/AuthShell';

export const metadata = { title: 'Set a new password', robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ searchParams }) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose something you have not used on another site."
    >
      <ResetPasswordForm token={token || ''} />
    </AuthShell>
  );
}
