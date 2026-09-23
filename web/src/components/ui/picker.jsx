"use client";

import * as React from "react";
import { Combobox } from "@base-ui/react/combobox";
import { cn } from "cn";
import { Check, ChevronDown, Plus, X } from "lucide-react";

/**
 * Picker - ONE control for "choose from a list", however long the list is.
 *
 * WHY ONE COMPONENT (24 Sep 2026)
 *   The seller form had four different ways to answer the same kind of
 *   question: a native <select> for 21 product types, a row of 19 chips for
 *   fabric, a text box that asked the seller to type slashes for colour, and a
 *   comma-separated string for search words. Four behaviours to learn, and the
 *   two text ones quietly produced data the shop's own filters could not read.
 *   Rajat: "one ui component used for many, clean and clear". This is it.
 *
 * THE PATTERN, FROM THE REFERENCES
 *   Amazon Seller Central and Flipkart's listing form answer a long attribute
 *   list the same way: a field you can type into, a dropdown that filters as
 *   you type, a tick against what is chosen, and the chosen values sitting in
 *   the field as removable chips. Shopify admin's tags field is the same shape
 *   with values you invent yourself. Both are here, one prop apart
 *   (`allowCustom`), so a seller learns the control once.
 *
 * WHAT IT REFUSES TO DO
 *   It does not hide the list behind a search box: opening it shows everything
 *   (Base UI keeps the popup open while you tick in `multiple` mode), and the
 *   typing is there for when scrolling is slower - which starts at about a
 *   dozen options. A seller who does not know the word can still read the list.
 *
 * THE CAP AND THE EXCLUSIVE WORDS
 *   `max` exists because Google takes one primary value and up to two
 *   secondary ones for colour, material and pattern. When it is reached the
 *   unticked rows go quiet rather than vanishing, so the seller can see what
 *   they did not pick. And "None", "All", "Not applicable" and "Unisex" cannot
 *   sit beside another answer - ticking one clears the rest, because a listing
 *   that says "no stones" AND "Kundan" is a listing nobody can trust.
 */

/** Words that mean "and nothing else", whatever list they appear in. */
export const EXCLUSIVE = ['None', 'All', 'Not applicable', 'Not stated', 'Unisex'];

const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/*
 * Enter inside this field means "that one", never "save the listing" (24 Sep
 * 2026 - found in the browser: typing a colour and pressing Enter submitted
 * the whole product form). Base UI's own selection runs on keydown; this only
 * cancels the browser's default, which for a lone input in a form is submit.
 */
const swallowEnter = (e) => {
  if (e.key === 'Enter') e.preventDefault();
};

export function Picker({
  options = [],
  value,
  onChange,
  multiple = false,
  max = null,
  allowCustom = false,
  exclusive = EXCLUSIVE,
  placeholder = 'Choose…',
  customHint = 'or type your own',
  id,
  name,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}) {
  const [query, setQuery] = React.useState('');
  const chosen = multiple ? asArray(value) : value || '';
  const count = multiple ? chosen.length : 0;
  const full = multiple && max != null && count >= max;

  const typed = query.trim();
  const isNew = allowCustom && typed.length > 0 && !options.some((o) => same(o, typed));
  // The invented value rides in the list as an ordinary item; the renderer is
  // what marks it "Add …". Base UI's own filter keeps it, since it matches the
  // query exactly.
  const items = isNew ? [...options, typed] : options;

  const commit = (next) => {
    setQuery('');
    if (!multiple) return onChange(next || '');
    let list = asArray(next).map((s) => String(s).trim()).filter(Boolean);
    // Exclusive wins if it was just added; otherwise it steps aside.
    const added = list.find((v) => !asArray(chosen).includes(v));
    if (added && exclusive.some((e) => same(e, added))) list = [added];
    else if (list.length > 1) list = list.filter((v) => !exclusive.some((e) => same(e, v)));
    if (max != null) list = list.slice(0, max);
    onChange([...new Set(list)]);
  };

  return (
    <div className={cn('w-full', className)}>
      <Combobox.Root
        items={items}
        multiple={multiple}
        value={multiple ? chosen : chosen || null}
        onValueChange={commit}
        onInputValueChange={setQuery}
        // With a value you can invent, Enter must mean "yes, that one" without
        // an arrow-down first - that is how a tags field is expected to behave.
        autoHighlight={allowCustom}
        disabled={disabled}
        name={name}
      >
        <Combobox.InputGroup
          className={cn(
            'flex min-h-10 w-full cursor-text flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm transition-colors',
            'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
            disabled && 'pointer-events-none opacity-50',
            'dark:bg-input/30',
          )}
        >
          {multiple ? (
            <Combobox.Value>
              {(current) => (
                <Combobox.Chips className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                  {asArray(current).map((v) => (
                    <Combobox.Chip
                      key={v}
                      className="group flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pr-1 pl-2.5 text-xs font-medium outline-none focus-within:ring-2 focus-within:ring-ring/50 data-highlighted:bg-primary/20"
                      aria-label={v}
                    >
                      {v}
                      <Combobox.ChipRemove
                        className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-primary/20 hover:text-foreground"
                        aria-label={`Remove ${v}`}
                      >
                        <X className="size-3" aria-hidden />
                      </Combobox.ChipRemove>
                    </Combobox.Chip>
                  ))}
                  <Combobox.Input
                    id={id}
                    aria-label={ariaLabel}
                    onKeyDown={swallowEnter}
                    placeholder={asArray(current).length > 0 ? '' : placeholder}
                    className="h-6 min-w-24 flex-1 border-0 bg-transparent p-0 text-base outline-none placeholder:text-muted-foreground md:text-sm"
                  />
                </Combobox.Chips>
              )}
            </Combobox.Value>
          ) : null}
          {multiple && (
            <Combobox.Icon className="shrink-0 text-muted-foreground">
              <ChevronDown className="size-4" aria-hidden />
            </Combobox.Icon>
          )}
          {!multiple && (
            <>
              <Combobox.Input
                id={id}
                aria-label={ariaLabel}
                onKeyDown={swallowEnter}
                placeholder={placeholder}
                className="h-6 min-w-24 flex-1 border-0 bg-transparent p-0 text-base outline-none placeholder:text-muted-foreground md:text-sm"
              />
              {/* One answer, so there has to be a way back to none of them. */}
              {chosen ? (
                <Combobox.Clear
                  className="ml-auto grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Clear"
                >
                  <X className="size-4" aria-hidden />
                </Combobox.Clear>
              ) : (
                <Combobox.Icon className="ml-auto shrink-0 text-muted-foreground">
                  <ChevronDown className="size-4" aria-hidden />
                </Combobox.Icon>
              )}
            </>
          )}
        </Combobox.InputGroup>

        <Combobox.Portal>
          <Combobox.Positioner className="isolate z-50" sideOffset={4}>
            <Combobox.Popup className="max-h-[min(var(--available-height),18rem)] w-(--anchor-width) origin-(--transform-origin) overflow-y-auto overscroll-contain rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0">
              <Combobox.Empty className="px-2 py-3 text-sm text-muted-foreground">
                {allowCustom ? 'Type it and press Enter to add it.' : 'Nothing matches that.'}
              </Combobox.Empty>
              <Combobox.List>
                {(item) => {
                  const fresh = isNew && item === typed;
                  return (
                    <Combobox.Item
                      key={item}
                      value={item}
                      // Past the cap the rest go quiet instead of disappearing:
                      // the seller can see what they did not choose.
                      disabled={full && !asArray(chosen).includes(item)}
                      className="flex min-h-9 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-disabled:opacity-40 data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                    >
                      <span className="grid size-4 shrink-0 place-items-center">
                        {fresh ? (
                          <Plus className="size-4 text-brand-ink" aria-hidden />
                        ) : (
                          <Combobox.ItemIndicator>
                            <Check className="size-4" aria-hidden />
                          </Combobox.ItemIndicator>
                        )}
                      </span>
                      <span>{fresh ? <>Add &ldquo;{item}&rdquo;</> : item}</span>
                    </Combobox.Item>
                  );
                }}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>

      {/* One quiet line under the field: how many are allowed, and - only when
          it matters - that a value may be invented. Never both shouting. */}
      {(max != null || allowCustom) && multiple && (
        <p className="mt-1 text-xs text-muted-foreground">
          {max != null && (
            <>
              {count}/{max}
              {full ? ' · remove one to add another' : ''}
            </>
          )}
          {max != null && allowCustom && !full ? ' · ' : ''}
          {allowCustom && !full && customHint}
        </p>
      )}
    </div>
  );
}

export default Picker;
