'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ChevronLeft, Star } from 'lucide-react';
import { shopHref } from '@/lib/shopUrl';
import PriceFilter from '@/components/shop/PriceFilter';

/**
 * The filters - Myntra's left rail, at our size.
 *
 * WHAT CHANGED (13 Sep 2026; Rajat: "text ki list, mazaa nahi aa raha")
 *   Sections that fold, a tick beside the one that is on, counts in quiet
 *   grey, colours as swatches you can see before you read, sizes as chips,
 *   price as a slider with the two boxes under it, ratings as stars. Options
 *   with nothing behind them are not shown - Baymard's dead-end rule: a
 *   filter that empties the page teaches people not to touch filters.
 *
 * CATEGORY IS A TREE, NOT A CHECKBOX (Rajat, 13 Sep: "ek baar me ek select,
 * par checkbox dikh raha hai - galat")
 *   A checkbox promises "pick several"; a category is one place you are
 *   standing in. Amazon's "Department" and Flipkart's category rail both
 *   draw it as a tree: where you are in bold, its children indented, a
 *   "‹ back" to the level above. Colour and size ARE checkboxes, and so
 *   they now truly multi-select (color=Gold,Red) - the control keeps its
 *   promise both ways.
 *
 * WHAT DID NOT CHANGE
 *   Every option is still a LINK. Each filtered view keeps a real URL that
 *   can be shared and crawled; the panel is a client component only for the
 *   fold state and the slider.
 */
const SWATCH = {
  gold: '#d4af37',
  'rose gold': '#b76e79',
  'antique gold': '#a67c2e',
  silver: '#c0c0c0',
  'oxidised silver': '#6e6e6e',
  copper: '#b87333',
  bronze: '#cd7f32',
  white: '#f5f5f5',
  'off white': '#f2ede4',
  cream: '#f3e9d2',
  beige: '#e8d9c0',
  black: '#1a1a1a',
  grey: '#8a8a8a',
  gray: '#8a8a8a',
  red: '#c8102e',
  maroon: '#7a1f2b',
  pink: '#e58fb3',
  peach: '#f2b8a0',
  orange: '#f0812a',
  yellow: '#f2c94c',
  green: '#2e8b57',
  teal: '#2a9d8f',
  blue: '#2f5fbf',
  navy: '#1f2a5a',
  purple: '#7b4fbf',
  brown: '#7b4a2d',
  multicolour: 'conic-gradient(#e63946, #f4a261, #e9c46a, #2a9d8f, #457b9d, #e63946)',
  multicolor: 'conic-gradient(#e63946, #f4a261, #e9c46a, #2a9d8f, #457b9d, #e63946)',
};
const swatchFor = (name) => SWATCH[String(name).toLowerCase()] || '#d9d9d9';

function Section({ title, open: initial = true, count, children }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="border-b pb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-1 text-left"
      >
        <span className="text-[0.8rem] font-semibold tracking-wide uppercase">
          {title}
          {count > 0 && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-[0.65rem] font-semibold text-brand-ink normal-case">{count}</span>}
        </span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
}

/**
 * A row that reads like a radio (one of these) and behaves like a link.
 * Rating is "at least N stars" - two rows, one answer - so it draws as a
 * radio, not a checkbox; the control's shape says how many you may pick.
 */
function Option({ href, on, children, count }) {
  return (
    <li>
      <Link href={href} aria-current={on ? 'true' : undefined} className="group flex items-center gap-2.5 rounded-md py-1.5 pr-1 hover:text-foreground">
        <span
          className={`grid size-4 shrink-0 place-items-center rounded-full border transition ${on ? 'border-brand-ink' : 'border-border bg-background group-hover:border-foreground/40'}`}
          aria-hidden
        >
          {on && <span className="size-2 rounded-full bg-brand-ink" />}
        </span>
        <span className={`min-w-0 flex-1 truncate ${on ? 'font-medium text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>{children}</span>
        {count != null && <span className="text-xs tabular-nums text-muted-foreground/70">{count}</span>}
      </Link>
    </li>
  );
}

/** Comma-separated multi-values in the URL: toggle one in or out. */
const listOf = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
const toggled = (v, value) => {
  const has = listOf(v).some((x) => x.toLowerCase() === String(value).toLowerCase());
  const next = has ? listOf(v).filter((x) => x.toLowerCase() !== String(value).toLowerCase()) : [...listOf(v), value];
  return next.join(',');
};
const hasValue = (v, value) => listOf(v).some((x) => x.toLowerCase() === String(value).toLowerCase());

/** One line of the category tree: no box - you are either here or you go there. */
function TreeItem({ href, on, depth = 0, count, children }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={on ? 'page' : undefined}
        className={`flex items-center gap-2 rounded-md py-1.5 pr-1 ${on ? 'font-semibold text-brand-ink' : 'text-muted-foreground hover:text-foreground'}`}
        style={{ paddingLeft: `${depth * 0.875}rem` }}
      >
        {on && <span aria-hidden className="h-4 w-0.5 rounded-full bg-brand-ink" />}
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {count != null && <span className="text-xs tabular-nums text-muted-foreground/70">{count}</span>}
      </Link>
    </li>
  );
}

export default function FilterPanel({ params, categories, colors, sizes = [], price }) {
  const active = (key, value) => String(params[key] || '') === String(value);
  const live = categories.filter((c) => c.productCount > 0);
  const currentParent = live.find((c) => active('category', c.slug) || (c.children || []).some((ch) => active('category', ch.slug)));

  return (
    <aside className="space-y-4 text-sm">
      <Section title="Category">
        {!currentParent ? (
          /* Top level: every department with its count. */
          <ul className="space-y-0.5">
            <TreeItem href={shopHref(params, { category: '' })} on>
              Everything
            </TreeItem>
            {live.map((cat) => (
              <TreeItem key={cat._id} href={shopHref(params, { category: cat.slug })} count={cat.productCount} depth={1}>
                {cat.name}
              </TreeItem>
            ))}
          </ul>
        ) : (
          /* Inside a department: a way up, the department, its children. The
             other departments step aside - Amazon's rail does the same. */
          <ul className="space-y-0.5">
            <li>
              <Link href={shopHref(params, { category: '' })} className="flex items-center gap-1 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                <ChevronLeft className="size-3.5" /> All categories
              </Link>
            </li>
            <TreeItem href={shopHref(params, { category: currentParent.slug })} on={active('category', currentParent.slug)} count={currentParent.productCount}>
              {currentParent.name}
            </TreeItem>
            {(currentParent.children || [])
              .filter((c) => c.productCount > 0)
              .map((child) => (
                <TreeItem key={child._id} href={shopHref(params, { category: active('category', child.slug) ? currentParent.slug : child.slug })} on={active('category', child.slug)} count={child.productCount} depth={1}>
                  {child.name}
                </TreeItem>
              ))}
          </ul>
        )}
      </Section>

      <PriceFilter key={`${price?.min}-${price?.max}-${params.minPrice || ''}-${params.maxPrice || ''}`} params={params} range={price} />

      {colors.filter((c) => c.count > 0).length > 0 && (
        <Section title="Colour" count={listOf(params.color).length}>
          <ul className="space-y-0.5">
            {colors
              .filter((c) => c.count > 0)
              .map((c) => {
                const on = hasValue(params.color, c.value);
                return (
                  <li key={c.value}>
                    <Link
                      href={shopHref(params, { color: toggled(params.color, c.value) })}
                      aria-current={on ? 'true' : undefined}
                      className="group flex items-center gap-2.5 rounded-md py-1.5 pr-1"
                    >
                      <span
                        className={`grid size-4 shrink-0 place-items-center rounded-[4px] border transition ${on ? 'border-brand-ink bg-brand-ink text-white' : 'border-border bg-background group-hover:border-foreground/40'}`}
                        aria-hidden
                      >
                        {on && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      <span aria-hidden className="size-4 shrink-0 rounded-full border border-black/10 shadow-inner" style={{ background: swatchFor(c.value) }} />
                      <span className={`min-w-0 flex-1 truncate ${on ? 'font-medium text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>{c.value}</span>
                      <span className="text-xs tabular-nums text-muted-foreground/70">{c.count}</span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </Section>
      )}

      {sizes.length > 0 && (
        <Section title="Size" count={listOf(params.size).length}>
          <ul className="flex flex-wrap gap-2">
            {sizes.map((s) => {
              const on = hasValue(params.size, s.value);
              return (
                <li key={s.value}>
                  <Link
                    href={shopHref(params, { size: toggled(params.size, s.value) })}
                    aria-current={on ? 'true' : undefined}
                    className={`block min-w-10 rounded-full border px-3 py-1.5 text-center text-sm transition ${
                      on ? 'border-brand-ink bg-brand-ink font-medium text-white' : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                    }`}
                  >
                    {s.value}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="Rating" count={params.minRating ? 1 : 0}>
        <ul className="space-y-0.5">
          {[4, 3].map((r) => (
            <Option key={r} href={shopHref(params, { minRating: active('minRating', r) ? '' : r })} on={active('minRating', r)}>
              <span className="inline-flex items-center gap-1">
                <span className="inline-flex text-amber-500" aria-hidden>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="size-3.5" fill={i <= r ? 'currentColor' : 'none'} strokeWidth={i <= r ? 0 : 1.5} />
                  ))}
                </span>
                <span>{r}★ &amp; up</span>
              </span>
            </Option>
          ))}
        </ul>
      </Section>
    </aside>
  );
}
