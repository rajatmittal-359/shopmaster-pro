'use client';

import { openConsent } from '@/lib/consent';

/** The footer's way back to the cookie bar - consent is as easy to withdraw as to give. */
export default function CookieChoices({ className = '' }) {
  return (
    <button type="button" onClick={openConsent} className={`underline-offset-2 hover:underline ${className}`}>
      Cookie choices
    </button>
  );
}
