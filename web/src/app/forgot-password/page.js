import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm';
import AuthShell from '@/components/auth/AuthShell';

export const metadata = { title: 'Forgotten password', robots: { index: false, follow: true } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Forgotten your password"
      subtitle="We will email you a link to set a new one."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
