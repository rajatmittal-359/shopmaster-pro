'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearSession } from '@/lib/session';
import { Button } from '@/components/ui/button';

/**
 * What to show when the API says 403.
 *
 * WHY THIS IS NOT JUST AN ERROR MESSAGE
 *   A 403 here is not a fault - it is the capability model working. An admin
 *   account is deliberately refused a cart: the account exists to run the shop,
 *   not to shop on it. Rendering "Access denied. Insufficient permissions."
 *   with a "Try again" button is wrong twice over. It reads as a bug in the
 *   site, and the retry can never succeed.
 *
 * WHAT SOMEBODY IN THIS STATE ACTUALLY NEEDS
 *   Not an apology and not a retry - the way to the account that CAN do this.
 *   So the only action offered is to sign out and sign in as somebody else,
 *   which is the real fix, plus a way back to the catalogue for anyone who
 *   arrived here by accident.
 *
 * WHAT IT DOES NOT DO
 *   It does not name the role. "You are an admin" is a detail of our
 *   permission model, and the person already knows which account they used.
 */
export default function NotForThisAccount({
  what = 'this',
  detail = 'The account you are signed in with cannot use this part of the site.',
}) {
  const router = useRouter();

  const switchAccount = () => {
    clearSession();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="rounded-xl border p-6">
      <p className="font-medium">Not available on this account</p>
      <p className="mt-1.5 text-sm text-muted-foreground">{detail}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={switchAccount} size="sm">
          Sign in with another account
        </Button>
        <Link href="/shop" className="text-sm text-brand-ink hover:underline">
          Back to {what === 'this' ? 'the shop' : what}
        </Link>
      </div>
    </div>
  );
}
