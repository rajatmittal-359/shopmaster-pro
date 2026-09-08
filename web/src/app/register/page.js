import RegisterForm from '@/components/auth/RegisterForm';
import GoogleButton from '@/components/auth/GoogleButton';
import AuthShell from '@/components/auth/AuthShell';

export const metadata = {
  title: 'Create an account',
  description: 'Create a ShopMaster Pro account to order, track and return.',
  robots: { index: false, follow: true },
};

export default async function RegisterPage({ searchParams }) {
  const params = await searchParams;
  const one = (key) => (Array.isArray(params[key]) ? params[key][0] : params[key]);

  const raw = one('next');
  // Same rule as the sign-in page: our own paths only, never an absolute URL
  // and never protocol-relative. An open redirect on a shop is a phishing kit.
  const next = typeof raw === 'string' && /^\/(?!\/)/.test(raw) ? raw : '/';

  return (
    <AuthShell
      title="Create an account"
      subtitle="One account to buy with - and to sell with, if you tick the box below."
    >
      {/* Creating an account with Google skips the password AND the code that
          arrives by email - Google has already verified the address. */}
      <GoogleButton next={next} />

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or with your email
        <span className="h-px flex-1 bg-border" />
      </div>

      <RegisterForm next={next} verifyEmail={one('verify') || ''} selling={one('sell') === '1'} />
    </AuthShell>
  );
}
