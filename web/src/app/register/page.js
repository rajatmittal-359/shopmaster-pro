import RegisterForm from '@/components/auth/RegisterForm';

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
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        One account to buy with. Selling is something you add to it later.
      </p>

      <div className="mt-6">
        <RegisterForm next={next} verifyEmail={one('verify') || ''} />
      </div>
    </div>
  );
}
