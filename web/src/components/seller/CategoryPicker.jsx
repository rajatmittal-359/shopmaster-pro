'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';

/**
 * Choosing a category: type a word, pick from what matches.
 *
 * WHAT WAS WRONG
 *   A native <select> with forty entries reading "Jewellery → Maang Tikka",
 *   unstyled, with no way to search. Shopify and Amazon both give this field a
 *   search box because the list is long and the seller knows the WORD -
 *   "tikka", "kurti" - not where it sits in the tree.
 *
 * HOW IT IS ORGANISED
 *   Grouped under the parent, so the tree is visible without being a tree to
 *   navigate. Typing filters on the leaf name AND the parent name, so "jew"
 *   shows every jewellery leaf and "tikka" shows the one.
 *
 * KEYBOARD
 *   Arrows move, Enter picks, Escape closes - the same combobox contract as
 *   the site's search box, so it behaves the way the rest of the site does.
 */
export default function CategoryPicker({ id, options, value, onChange, placeholder = 'Choose a category' }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((o) => String(o._id) === String(value));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  // Grouped for display; flat for keyboard indexing.
  const groups = useMemo(() => {
    const map = new Map();
    for (const o of filtered) {
      const [parent, ...rest] = o.label.split(' → ');
      const leaf = rest.length ? rest.join(' → ') : parent;
      const key = rest.length ? parent : 'Top level';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ ...o, leaf });
    }
    return Array.from(map.entries());
  }, [filtered]);
  const flat = groups.flatMap(([, items]) => items);

  useEffect(() => {
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const pick = (o) => {
    onChange(o._id);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') return setOpen(false);
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flat[active]) {
      e.preventDefault();
      pick(flat[active]);
    }
  };

  let index = -1;

  return (
    <div ref={boxRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className={selected ? '' : 'text-muted-foreground'}>{selected ? selected.label : placeholder}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Type to search - tikka, kurti, bedsheet"
              className="h-10 flex-1 bg-transparent text-sm outline-none"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
            />
          </div>

          <ul id={listId} role="listbox" className="max-h-72 overflow-y-auto py-1">
            {flat.length === 0 && (
              <li className="px-3 py-3 text-sm text-muted-foreground">Nothing called &ldquo;{query}&rdquo;.</li>
            )}
            {groups.map(([parent, items]) => (
              <li key={parent}>
                <p className="px-3 pt-2 pb-1 text-[0.7rem] font-medium tracking-wider text-muted-foreground uppercase">
                  {parent}
                </p>
                <ul>
                  {items.map((o) => {
                    index += 1;
                    const i = index;
                    const isActive = i === active;
                    const isSelected = String(o._id) === String(value);
                    return (
                      <li key={o._id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onMouseEnter={() => setActive(i)}
                          onClick={() => pick(o)}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                            isActive ? 'bg-accent' : ''
                          }`}
                        >
                          <span>{o.leaf}</span>
                          {isSelected && <Check className="size-4 text-brand-ink" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
