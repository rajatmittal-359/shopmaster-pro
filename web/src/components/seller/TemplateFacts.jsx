'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { authedFetch } from '@/lib/client';

/**
 * The category's own questions (Listing templates S2, 22 Sep 2026).
 *
 * Amazon's attribute sheet, Meesho's 6-8 questions per category: once the
 * category is chosen, the form asks what THAT kind of thing needs - plating and
 * stone for jewellery, fabric and sleeve for a kurta, thread count for a
 * bedsheet - as dropdowns from Flipkart's own facet values, so the answers are
 * the words shoppers filter on. The AI writer fills the same fields from the
 * photo; the seller corrects. Required facts are marked and counted by the
 * listing score.
 *
 * `template` comes from GET /public/products/categories/:id/template (cached
 * an hour on the server). No category yet → the general questions.
 */
export function useListingTemplate(categoryId) {
  const [template, setTemplate] = useState(null);
  useEffect(() => {
    let cancelled = false;
    authedFetch(`/public/products/categories/${categoryId || 'none'}/template`)
      .then((d) => { if (!cancelled) setTemplate(d.template || null); })
      .catch(() => { if (!cancelled) setTemplate(null); });
    return () => { cancelled = true; };
  }, [categoryId]);
  return template;
}

export default function TemplateFacts({ template, productType, attributes = {}, onChange, t = (s) => s }) {
  if (!template) return null;
  const set = (key, value) => onChange({ productType, attributes: { ...attributes, [key]: value } });
  const missing = template.attributes.filter((a) => a.required && !(attributes[a.key] && String(attributes[a.key]).length));

  return (
    <div className="space-y-4">
      {template.productTypes?.length > 0 && (
        <label className="block text-sm">
          <span className="font-medium">{t('What is it?')}</span>
          <select
            value={productType || ''}
            onChange={(e) => onChange({ productType: e.target.value, attributes })}
            className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">{t('Choose…')}</option>
            {template.productTypes.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">{t('In the words a shopper uses. The title is built around it.')}</span>
        </label>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {template.attributes.map((a) => {
          const value = attributes[a.key];
          const label = <span className="font-medium">{a.label}{a.required && <span className="text-destructive"> *</span>}</span>;
          if (a.type === 'select') {
            return (
              <label key={a.key} className="block text-sm">
                {label}
                <select value={value || ''} onChange={(e) => set(a.key, e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
                  <option value="">{t('Not stated')}</option>
                  {a.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            );
          }
          if (a.type === 'multi') {
            /*
             * More than one answer is often the true one - Kundan AND pearls,
             * printed AND embroidered, dry AND sensitive skin (23 Sep 2026).
             * The cap is the attribute's own `max` (3, Google's ceiling for
             * colour/material/pattern): past it the untouched chips go quiet
             * rather than vanishing, so the seller can see what they did not
             * pick and swap instead of hunting for a missing option.
             */
            const chosen = Array.isArray(value) ? value : [];
            const max = a.max || 3;
            const full = chosen.length >= max;
            return (
              <div key={a.key} className="text-sm sm:col-span-2">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  {label}
                  <span className="text-xs text-muted-foreground">{chosen.length}/{max}{full ? ` · ${t('remove one to pick another')}` : ''}</span>
                </span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {a.options.map((o) => {
                    const on = chosen.includes(o);
                    return (
                      <button key={o} type="button" disabled={!on && full} onClick={() => set(a.key, on ? chosen.filter((x) => x !== o) : [...chosen, o])} aria-pressed={on} className={`disabled:opacity-40 rounded-full border px-2.5 py-1 text-xs transition ${on ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:border-primary'}`}>
                        {o}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }
          return (
            <label key={a.key} className={`block text-sm ${a.max > 120 ? 'sm:col-span-2' : ''}`}>
              {label}
              <Input value={value || ''} onChange={(e) => set(a.key, e.target.value)} maxLength={a.max || 120} placeholder={a.hint || ''} className="mt-1 h-10" />
            </label>
          );
        })}
      </div>

      {missing.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t('Still needed for a complete listing:')} {missing.map((a) => a.label).join(', ')}.
        </p>
      )}
    </div>
  );
}
