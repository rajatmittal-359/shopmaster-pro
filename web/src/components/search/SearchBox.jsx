'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { apiBase } from '@/lib/api';
import { priceOf } from '@/lib/pricing';

/**
 * The search field, and the suggestions under it.
 *
 * WHY THE SITE HAS ONE AT ALL NOW
 *   It did not, and that was the largest single gap against every reference.
 *   The API had supported `?search=` since the beginning and nothing on the
 *   site could reach it. Baymard's position is blunt: search belongs in the
 *   header, visible - not behind an icon - and for anyone hunting a specific
 *   thing it beats navigation outright.
 *
 * WHY SUGGESTIONS AND NOT JUST A FIELD
 *   Three quarters of shoppers use them, and they do three jobs a plain field
 *   cannot: they prevent typos, they teach the words this particular shop uses
 *   for things, and they let somebody jump straight to a CATEGORY instead of
 *   picking one product and then hunting for its siblings. Somebody typing
 *   "ear" usually wants Earrings, not one pair of them.
 *
 * WHY SIX PRODUCTS AND THREE CATEGORIES
 *   On a phone the list is trapped between the field above it and the keyboard
 *   below, and the research puts the usable ceiling at five or six. The server
 *   enforces the same numbers, so this cannot quietly ask for more.
 *
 * WHY IT IS A COMBOBOX AND NOT A DIV WITH A LIST IN IT
 *   Arrow keys, Enter and Escape are how a lot of people use a search field,
 *   and a screen reader needs to be told that typing here changes a list
 *   somewhere else. That is what role="combobox" plus aria-activedescendant
 *   says. The highlighted row is tracked by INDEX rather than by focus, because
 *   moving real focus into the list takes the caret out of the input and
 *   typing then goes nowhere.
 */
export default function SearchBox({ className = '', autoFocus = false, onDone = null }) {
  const router = useRouter();
  const listId = useId();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState({ products: [], categories: [] });
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  const rows = [
    ...results.categories.map((c) => ({ kind: 'category', key: `c-${c._id}`, item: c })),
    ...results.products.map((p) => ({ kind: 'product', key: `p-${p._id}`, item: p })),
  ];

  /*
   * Debounced, and every in-flight request is aborted when the next keystroke
   * arrives. Without the abort, a slow answer for "ea" can land after the fast
   * answer for "earring" and replace the right list with a stale one - which
   * looks like the field guessing wildly as you type.
   */
  useEffect(() => {
    const query = term.trim();
    /*
     * Nothing is cleared here on the way down to one character. The list is
     * hidden below two characters anyway, so clearing would be a state update
     * nobody can see - and doing it in an effect body is the pattern that
     * causes a second render on every keystroke.
     */
    if (query.length < 2) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase}/public/products/suggest?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        setResults({ products: data.products || [], categories: data.categories || [] });
        setActive(-1);
      } catch {
        // An aborted or failed suggestion is not an error worth showing. The
        // field still submits, and the results page does the real search.
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  // A click anywhere else closes the list. Pointerdown rather than click, so
  // the list is gone before the thing underneath receives the press.
  useEffect(() => {
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const go = (href) => {
    setOpen(false);
    inputRef.current?.blur();
    if (onDone) onDone();
    router.push(href);
  };

  const submit = (e) => {
    e.preventDefault();
    const query = term.trim();
    if (!query) return;
    // Straight to the shop, which already reads ?search= and carries the
    // filters and the sort a searcher reaches for next. A separate results
    // page would be the same grid with fewer tools on it.
    go(`/shop?search=${encodeURIComponent(query)}`);
  };

  const hrefFor = (row) =>
    row.kind === 'category'
      ? `/shop?category=${encodeURIComponent(row.item.slug || row.item._id)}`
      : `/products/${row.item.slug || row.item._id}`;

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (!open || rows.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % rows.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? rows.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      // Only when a row is highlighted. Otherwise Enter means "search for what
      // I typed", which is what somebody who ignored the list expects.
      e.preventDefault();
      go(hrefFor(rows[active]));
    }
  };

  const showList = open && term.trim().length >= 2;

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <form onSubmit={submit} role="search">
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search for products
        </label>

        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />

        <input
          id={`${listId}-input`}
          ref={inputRef}
          type="search"
          value={term}
          autoFocus={autoFocus}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search for anything"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          /* The native clear cross is suppressed because it appears only in
             some browsers and sits under our own button. */
          className="h-10 w-full rounded-full border border-input bg-background/70 pr-9 pl-9 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30 [&::-webkit-search-cancel-button]:appearance-none"
        />

        {term && (
          <button
            type="button"
            onClick={() => {
              setTerm('');
              setResults({ products: [], categories: [] });
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </form>

      {showList && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search suggestions"
          /*
           * SOLID, not frosted, and deliberately so. This panel lands on top of
           * the category strip and the page headline, and it is dense - names,
           * categories and prices. The research is direct about the failure
           * mode: text over a semi-transparent surface drops below 4.5:1 and
           * the "glass" that looked good empty becomes unreadable full. Glass
           * is for the header and the overlays; a list of things to read gets a
           * background.
           */
          className="absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-xl border bg-popover shadow-lg ring-1 ring-foreground/5"
        >
          {rows.length === 0 ? (
            /* Not a dead end. Somebody who typed something we do not stock
               still gets the one action that might work, rather than a
               shrug. */
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Nothing matched “{term.trim()}”.{' '}
              <button type="button" onClick={submit} className="text-brand-ink underline">
                Search anyway
              </button>
            </p>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto py-1">
              {rows.map((row, i) => {
                const highlighted = i === active;

                return (
                  <li key={row.key}>
                    <button
                      type="button"
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={highlighted}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => go(hrefFor(row))}
                      onMouseEnter={() => setActive(i)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                        highlighted ? 'bg-accent' : ''
                      }`}
                    >
                      {row.kind === 'category' ? (
                        <>
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                            <Search className="size-4 text-brand-ink" />
                          </span>
                          <span className="min-w-0 flex-1 text-sm">
                            <span className="font-medium">{row.item.name}</span>
                            <span className="ml-2 text-muted-foreground">category</span>
                          </span>
                        </>
                      ) : (
                        <>
                          {/* A thumbnail, because the research is specific that
                              image-driven suggestions are what make a list
                              scannable rather than eight lines of grey text. */}
                          <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                            {row.item.image ? (
                              <Image
                                src={row.item.image}
                                alt=""
                                fill
                                sizes="40px"
                                className="object-cover"
                              />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{row.item.name}</span>
                            {row.item.categoryName && (
                              <span className="block truncate text-xs text-muted-foreground">
                                in {row.item.categoryName}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-sm font-medium">
                            ₹{priceOf(row.item).price.toLocaleString('en-IN')}
                          </span>
                        </>
                      )}
                    </button>
                  </li>
                );
              })}

              <li className="border-t">
                <button
                  type="button"
                  onClick={submit}
                  className="w-full px-3 py-2.5 text-left text-sm font-medium text-brand-ink hover:bg-accent"
                >
                  See everything for “{term.trim()}”
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
