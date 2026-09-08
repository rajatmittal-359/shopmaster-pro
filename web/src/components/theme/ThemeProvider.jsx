'use client';

import { ThemeProvider as NextThemes } from 'next-themes';

/**
 * Light, dark, or whatever the phone is already set to.
 *
 * WHY THE SITE HAS THIS AT ALL
 *   A large share of the people this brand is aimed at keep every app they own
 *   in dark mode, and a shop that ignores the setting is the one white
 *   rectangle in their evening. The palette already defines every colour twice,
 *   so this costs one class on <html> - not a second stylesheet.
 *
 * WHY `system` IS THE DEFAULT
 *   The best theme is the one the person already chose, on their phone, once.
 *   Asking again is a worse answer than reading it.
 *
 * `disableTransitionOnChange` stops every coloured surface on the page from
 * animating at once when the theme flips, which looks like a fault rather than
 * a transition.
 */
export default function ThemeProvider({ children }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
