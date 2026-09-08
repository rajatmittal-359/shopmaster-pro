import LoginForm from '@/components/auth/LoginForm';
import GoogleButton from '@/components/auth/GoogleButton';
import AuthShell from '@/components/auth/AuthShell';

export const metadata = {
  title: 'Sign in',
  description: 'Sign in to ShopMaster Pro to see your orders, cart and addresses.',
  // A sign-in form has nothing to offer a search result, and indexing it
  // splits the ranking of the pages that do.
  robots: { index: false, follow: true },
};

/**
 * `next` is read HERE, on the server, and handed down.
 *
 * Reading it in the client component would mean useSearchParams, which Next
 * requires to sit inside a Suspense boundary - a boundary around the only thing
 * on the page, for a value the server already has.
 */
export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const raw = Array.isArray(params.next) ? params.next[0] : params.next;

  /*
   * Only a path on this site. `?next=https://evil.example` would otherwise turn
   * our own sign-in form into an open redirect - the standard way a phishing
   * link borrows a real domain's credibility. Two leading slashes are rejected
   * as well: //evil.example is a protocol-relative URL.
   */
  const next = typeof raw === 'string' && /^\/(?!\/)/.test(raw) ? raw : '/';

  return (
    <AuthShell title="Sign in" subtitle="To see your orders, your cart and your addresses.">
      {/*
        Google FIRST, then the form. Somebody arriving from an Instagram link
        will not stop to invent a password, and the whole point of this button
        is that they do not have to - but the form stays underneath because
        Google is blocked inside the Instagram and Facebook in-app browsers,
        which is exactly where that traffic comes from.
      */}
      <GoogleButton next={next} />

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or with your email
        <span className="h-px flex-1 bg-border" />
      </div>

      <LoginForm next={next} />
    </AuthShell>
  );
}
