/**
 * The one button.
 *
 * WHY THIS EXISTS
 *   There were 77 hand-styled buttons across the app and no rule behind them.
 *   A single seller order card carried three: blue "View Full Details", green
 *   "Book courier & ship", orange "Mark as processing" - three colours saying
 *   nothing, so a seller could not tell which one they were meant to press.
 *   The order page's "Return Order" was the only purple control in the product.
 *
 * THE RULE, and it is about importance, not decoration:
 *
 *   primary      solid orange   ONE per screen - the thing you came to do
 *   secondary    white + border  everything else that is a real action
 *   destructive  red             only when something is destroyed or refunded
 *   ghost        plain text      tertiary, or an action inside a dense list
 *
 *   If a screen seems to need two primaries, one of them is secondary.
 *
 * Colour on a BUTTON means priority. Colour on a BADGE means state. That is
 * why blue is fine on a "Shipped" badge and never on a button.
 */

const VARIANTS = {
  primary:
    'bg-orange-600 text-white border border-orange-600 ' +
    'hover:bg-orange-700 hover:border-orange-700 ' +
    'focus-visible:outline-orange-600',
  secondary:
    'bg-white text-gray-800 border border-gray-300 ' +
    'hover:bg-gray-50 hover:border-gray-400 ' +
    'focus-visible:outline-gray-500',
  destructive:
    'bg-white text-red-700 border border-red-300 ' +
    'hover:bg-red-50 hover:border-red-400 ' +
    'focus-visible:outline-red-600',
  ghost:
    'bg-transparent text-gray-600 border border-transparent ' +
    'hover:text-orange-700 hover:bg-orange-50 ' +
    'focus-visible:outline-orange-600',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

/**
 * @param {'primary'|'secondary'|'destructive'|'ghost'} [variant]
 * @param {'sm'|'md'|'lg'} [size]
 * @param {boolean} [loading]  shows `loadingText` and blocks further presses
 * @param {boolean} [fullWidth]
 * @param {React.ElementType} [as]  render as something else - pass react-router's
 *   Link for an action that is really navigation, so it keeps middle-click and
 *   "open in new tab"
 */
export default function Button({
  as: Element = 'button',
  variant = 'secondary',
  size = 'md',
  loading = false,
  loadingText,
  fullWidth = false,
  disabled = false,
  className = '',
  children,
  ...props
}) {
  const isButton = Element === 'button';

  return (
    <Element
      // A button that does something must not be pressable twice while it is
      // doing it - double-charging a customer is a real outcome of getting
      // this wrong. Anything that is not a <button> takes no disabled attribute.
      {...(isButton ? { disabled: disabled || loading } : {})}
      className={[
        'inline-flex items-center justify-center gap-2 rounded font-medium',
        'transition-colors duration-150',
        // Keyboard users need to see where they are. The app had no visible
        // focus state anywhere.
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTS[variant] || VARIANTS.secondary,
        SIZES[size] || SIZES.md,
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {loading ? loadingText || children : children}
    </Element>
  );
}
