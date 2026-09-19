import { Badge } from '@/components/ui/badge';

/**
 * One badge for every status on the site (20 Sep 2026).
 *
 * Three files were colouring statuses with their own inline classes, and
 * "Being packed" was a different colour in each. The shadcn rule is a
 * variant map, not conditional classes; the ui-ux-pro-max rule is that a
 * compact label never wraps (the Badge base already sets whitespace-nowrap)
 * and never says something by colour alone (the word is always there).
 * Callers pass a TONE and the WORDS; the words come from lib/orderStatus for
 * customers and from the seller queue's own vocabulary for sellers.
 */
const TONES = {
  brand: 'bg-primary/10 text-brand-ink',
  sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  muted: 'border-border text-muted-foreground',
  destructive: '',
};

export default function StatusBadge({ tone = 'brand', children, className = '' }) {
  const variant = tone === 'destructive' ? 'destructive' : tone === 'muted' ? 'outline' : 'secondary';
  return (
    <Badge variant={variant} className={`${TONES[tone] || ''} ${className}`.trim()}>
      {children}
    </Badge>
  );
}
