'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

/**
 * The one control that flips the site between light and dark.
 *
 * WHY BOTH ICONS ARE ALWAYS RENDERED AND CSS PICKS ONE
 *   The server cannot know which theme the browser resolved - `system` is a
 *   value only the browser can answer. The usual workaround is to render
 *   nothing until a `mounted` flag flips, which costs a state update on every
 *   page load and leaves a hole where the button should be. Drawing both and
 *   letting the `dark` class hide one is the same result with no state, no
 *   mismatch and nothing that moves after the page settles.
 *
 * WHY IT TOGGLES RATHER THAN OFFERING A MENU
 *   Three options - light, dark, system - is a menu for a decision people make
 *   by feel, in one tap, usually at night. `system` is still the default and
 *   still what a first-time visitor gets; this is the override.
 */
export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label="Switch between light and dark"
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Moon className="size-4.5 dark:hidden" />
      <Sun className="hidden size-4.5 dark:block" />
    </button>
  );
}
