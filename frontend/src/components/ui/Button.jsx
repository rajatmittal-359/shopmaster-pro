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

/*
 * `action-primary` is the app's only gradient, defined in index.css. It marks
 * the button that COMMITS - it is how the eye finds the main action without
 * reading the label. White on the old flat orange-600 measured 3.56:1, under
 * the 4.5 AA needs, so the gradient ends on -700 (5.18) and the border matches:
 * the fix and the flourish are the same change.
 */
const VARIANTS = {
  primary:
    'action-primary text-white border border-brand-700 ' +
    'hover:border-brand-800 shadow-sm hover:shadow ' +
    'focus-visible:outline-brand-700',
  secondary:
    'bg-white text-gray-800 border border-gray-300 ' +
    'hover:bg-gray-50 hover:border-gray-400 ' +
    'focus-visible:outline-gray-500',
  destructive:
    'bg-white text-red-700 border border-red-300 ' +
    'hover:bg-red-50 hover:border-red-400 ' +
    'focus-visible:outline-negative',
  ghost:
    'bg-transparent text-gray-600 border border-transparent ' +
    'hover:text-brand-700 hover:bg-brand-50 ' +
    'focus-visible:outline-brand-700',
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
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
        'transition-[background-image,background-color,border-color,box-shadow] duration-150',
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
