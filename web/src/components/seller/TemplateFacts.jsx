'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Picker } from '@/components/ui/picker';
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
        <div className="text-sm">
          <label htmlFor="productType" className="font-medium">{t('What is it?')}</label>
          {/* Twenty-one kinds of garment in a native dropdown was a scroll;
              the same Picker as every other question here, and typing three
              letters gets there (24 Sep 2026). */}
          <Picker
            id="productType"
            options={template.productTypes}
            value={productType || ''}
            onChange={(v) => onChange({ productType: v, attributes })}
            placeholder={t('Choose…')}
            className="mt-1"
          />
          <span className="mt-1 block text-xs text-muted-foreground">{t('In the words a shopper uses. The title is built around it.')}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {template.attributes.map((a) => {
          const value = attributes[a.key];
          const label = <span className="font-medium">{a.label}{a.required && <span className="text-destructive"> *</span>}</span>;
          if (a.type === 'select') {
            return (
              <div key={a.key} className="text-sm">
                <label htmlFor={`fact-${a.key}`}>{label}</label>
                <Picker id={`fact-${a.key}`} options={a.options} value={value || ''} onChange={(v) => set(a.key, v)} placeholder={t('Not stated')} className="mt-1" />
              </div>
            );
          }
          if (a.type === 'multi') {
            /*
             * More than one answer is often the true one - Kundan AND pearls,
             * printed AND embroidered, dry AND sensitive skin (23 Sep 2026).
             * The cap is the attribute's own `max` (3, Google's ceiling for
             * colour/material/pattern); `exclusive` words like "None" stand
             * alone. Nineteen fabrics as nineteen chips was a wall on a phone,
             * so this is the same Picker as every other question: the list
             * opens whole, and typing narrows it (24 Sep 2026).
             */
            return (
              <div key={a.key} className="text-sm sm:col-span-2">
                <label htmlFor={`fact-${a.key}`}>{label}</label>
                <Picker
                  id={`fact-${a.key}`}
                  multiple
                  options={a.options}
                  value={Array.isArray(value) ? value : value ? [value] : []}
                  onChange={(v) => set(a.key, v)}
                  max={a.max || 3}
                  placeholder={t('Choose or type…')}
                  className="mt-1"
                />
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
