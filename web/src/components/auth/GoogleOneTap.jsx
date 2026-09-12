'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useSession } from '@/lib/session';
import { GOOGLE_CLIENT_ID, ensureGsi, exchangeGoogleCredential, gsiReady } from '@/lib/googleSignIn';

/**
 * Google One Tap on the storefront.
 *
 * WHY
 *   The login wall is where a first-time visitor leaves. One Tap is the small
 *   "Continue as Rajat" card in the top-right that Flipkart, Myntra and
 *   Medium show a signed-out visitor: one tap, no form, the same Google
 *   account the person is already in. It uses the same client id and the
 *   same /auth/google exchange as the button on the login page, so it is not
 *   a second way in - it is the first way in, offered earlier.
 *
 * WHEN IT STAYS QUIET
 *   Signed in, on the login/register pages (the button is there), in the
 *   panels (ShopChrome hides it), or when Google itself decides not to show
 *   it - a dismissal puts it on Google's own cooldown, which is theirs to
 *   manage, not ours.
 */
const QUIET_ON = ['/login', '/register', '/forgot-password', '/reset-password', '/checkout'];

export default function GoogleOneTap() {
  const { signedIn } = useSession();
  const pathname = usePathname() || '/';
  const router = useRouter();
  const quiet = !GOOGLE_CLIENT_ID || signedIn || QUIET_ON.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (quiet) return undefined;
    let cancelled = false;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (cancelled || tries > 40) return clearInterval(timer);
      if (!gsiReady()) return undefined;
      clearInterval(timer);
      ensureGsi(async (response) => {
        try {
          const data = await exchangeGoogleCredential(response.credential);
          toast.success(`Signed in as ${data.user?.name || data.user?.email || 'you'}`);
          router.refresh();
        } catch (err) {
          toast.error(err.message);
        }
      });
      window.google.accounts.id.prompt();
      return undefined;
    }, 150);
    return () => {
      cancelled = true;
      clearInterval(timer);
      // Leaving the storefront for the login page: let its button take over.
      if (gsiReady()) window.google.accounts.id.cancel();
    };
  }, [quiet, router]);

  if (quiet) return null;
  return <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />;
}
