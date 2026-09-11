'use client';

import { useEffect, useRef } from 'react';
import { Bold, Italic, List, ListOrdered, Pilcrow } from 'lucide-react';

/**
 * The description box, as a seller expects one: bold, italic, bullets - and
 * never a tag in sight.
 *
 * WHAT WAS WRONG
 *   The description is stored as HTML (the product page renders paragraphs
 *   and bullet lists from it), and the form showed that HTML raw in a
 *   textarea: `<p>Elevate your festive look</p><ul><li>...`. A seller who has
 *   never seen a tag was being asked to edit around them. Shopify, Amazon and
 *   every marketplace worth copying give this field a small toolbar.
 *
 * WHY NO EDITOR LIBRARY
 *   The server accepts exactly nine tags - p, br, ul, ol, li, strong, em, b, i
 *   - and refuses everything else. A full editor would offer headings, links,
 *   colours and tables that the server would then reject, and would add a
 *   dependency this laptop cannot install. contenteditable plus four buttons
 *   covers everything the server will keep.
 *
 * WHY THE OUTPUT IS SCRUBBED ON THE WAY OUT
 *   Browsers write what they like into contenteditable: <div> for a new line,
 *   <span style> when text is pasted from Word, <font> from old mail clients.
 *   Everything that leaves this component is reduced to the nine allowed
 *   tags, with every attribute removed - so what the form sends is always
 *   something the server accepts, and pasting from anywhere is safe.
 */
const ALLOWED = new Set(['P', 'BR', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'B', 'I']);

/** Reduce arbitrary editor HTML to the server's whitelist, attributes gone. */
export function scrubHtml(html) {
  if (typeof document === 'undefined') return html;
  const root = document.createElement('div');
  root.innerHTML = html;

  const walk = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        continue;
      }
      walk(child);
      let tag = child.tagName;
      // A browser's line break is a div; a seller's is a paragraph.
      if (tag === 'DIV') tag = 'P';
      if (!ALLOWED.has(tag)) {
        // Unwrap: keep the words, drop the wrapper.
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      if (tag !== child.tagName) {
        const p = document.createElement(tag);
        p.append(...Array.from(child.childNodes));
        child.replaceWith(p);
        continue;
      }
      for (const attr of Array.from(child.attributes)) child.removeAttribute(attr.name);
    }
  };
  walk(root);

  // Loose text at the top level becomes a paragraph, so the output is always
  // block-structured and renders with the same spacing everywhere.
  const out = [];
  let run = [];
  const flush = () => {
    const text = run.map((n) => (n.nodeType === Node.TEXT_NODE ? n.textContent : n.outerHTML)).join('');
    if (text.trim()) out.push(`<p>${text}</p>`);
    run = [];
  };
  for (const n of Array.from(root.childNodes)) {
    const block = n.nodeType === Node.ELEMENT_NODE && ['P', 'UL', 'OL'].includes(n.tagName);
    if (block) {
      flush();
      if (n.textContent.trim() || n.querySelector('li')) out.push(n.outerHTML);
    } else run.push(n);
  }
  flush();
  return out.join('').replace(/<p>(\s|&nbsp;|<br>)*<\/p>/g, '');
}

const ToolButton = ({ onClick, label, children }) => (
  <button
    type="button"
    onMouseDown={(e) => e.preventDefault()} // keep the selection in the editor
    onClick={onClick}
    aria-label={label}
    title={label}
    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
  >
    {children}
  </button>
);

export default function RichTextEditor({ id, value, onChange, placeholder = '', minRows = 6 }) {
  const ref = useRef(null);

  // Load the value in once, and again only when it changes from OUTSIDE
  // (the AI filling the form). Writing on every keystroke would move the
  // caret to the start.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== (value || '') && document.activeElement !== el) {
      el.innerHTML = value || '';
    }
  }, [value]);

  const emit = () => onChange(scrubHtml(ref.current.innerHTML));
  const cmd = (name) => {
    document.execCommand(name, false, null);
    emit();
  };

  return (
    <div className="rounded-lg border border-input bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <div className="flex items-center gap-0.5 border-b px-1.5 py-1">
        <ToolButton label="Bold" onClick={() => cmd('bold')}>
          <Bold className="size-4" />
        </ToolButton>
        <ToolButton label="Italic" onClick={() => cmd('italic')}>
          <Italic className="size-4" />
        </ToolButton>
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolButton label="Bullet list" onClick={() => cmd('insertUnorderedList')}>
          <List className="size-4" />
        </ToolButton>
        <ToolButton label="Numbered list" onClick={() => cmd('insertOrderedList')}>
          <ListOrdered className="size-4" />
        </ToolButton>
        <ToolButton
          label="Plain paragraph"
          onClick={() => {
            document.execCommand('formatBlock', false, 'p');
            emit();
          }}
        >
          <Pilcrow className="size-4" />
        </ToolButton>
      </div>

      <div
        id={id}
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          // Plain text in, so a paste from Word cannot smuggle in styles.
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        }}
        style={{ minHeight: `${minRows * 1.6}rem` }}
        className="prose-sm max-w-none px-3 py-2 text-sm outline-none [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-1.5 [&_ul]:list-disc empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
      />
    </div>
  );
}
