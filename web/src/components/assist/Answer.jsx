import Link from 'next/link';

/**
 * The assistant answers in light markdown (headings, bullets, bold, paths).
 * This turns that into React nodes - no HTML injection, no markdown
 * library: headings, bullet and numbered lists, paragraphs, **bold**,
 * `code`, and any /path the model names becomes a real link into the app.
 */
const PATH_RE = /(^|[\s(])(\/(?:seller|admin|orders|account|help|contact|coupons|reviews|wishlist|cart|shop|sell|products|sellers|refund-policy|shipping-policy|selling-policy|terms|privacy|addresses)(?:\/[\w\-?=&.]*)*)(?=$|[\s).,;:!?])/g;

const inline = (text, key) => {
  const out = [];
  let i = 0;
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) out.push(<strong key={`${key}-${i++}`}>{linkify(part.slice(2, -2), `${key}-b${i}`)}</strong>);
    else if (part.startsWith('`') && part.endsWith('`')) out.push(<code key={`${key}-${i++}`} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{part.slice(1, -1)}</code>);
    else out.push(...linkify(part, `${key}-${i++}`));
  }
  return out;
};

const linkify = (text, key) => {
  const out = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(PATH_RE)) {
    const start = m.index + m[1].length;
    out.push(text.slice(last, start));
    out.push(
      <Link key={`${key}-l${n++}`} href={m[2]} className="font-medium text-brand-ink underline-offset-2 hover:underline">
        {m[2]}
      </Link>
    );
    last = start + m[2].length;
  }
  out.push(text.slice(last));
  return out.filter((x) => x !== '');
};

export default function Answer({ text }) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let list = null;
  const flush = () => {
    if (list) blocks.push(list);
    list = null;
  };
  // A blank line between two numbered items does not end the list - models
  // write lists that way, and "1. 1. 1." is what flushing there produced.
  const kindOf = (l) => (/^[-*•]\s+/.test(l) ? 'ul' : /^\d+[.)]\s+/.test(l) ? 'ol' : null);
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || /^---+$/.test(line)) {
      const next = lines.slice(idx + 1).find((l) => l.trim());
      if (list && next && kindOf(next.trim()) === list.type) return undefined;
      return flush();
    }
    const h = line.match(/^(#{1,4})\s+(.+)/);
    const bullet = line.match(/^[-*•]\s+(.+)/);
    const num = line.match(/^(\d+)[.)]\s+(.+)/);
    if (h) {
      flush();
      blocks.push({ type: 'h', text: h[2], key: idx });
    } else if (bullet || num) {
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        flush();
        list = { type, items: [], key: idx };
      }
      list.items.push((bullet || num)[bullet ? 1 : 2]);
    } else {
      flush();
      blocks.push({ type: 'p', text: line, key: idx });
    }
  });
  flush();

  return (
    <div className="space-y-2 text-sm leading-relaxed [overflow-wrap:anywhere]">
      {blocks.map((b) => {
        if (b.type === 'h') return <p key={b.key} className="pt-1 font-semibold">{inline(b.text, b.key)}</p>;
        if (b.type === 'ul' || b.type === 'ol') {
          const Tag = b.type;
          return (
            <Tag key={b.key} className={`ml-5 space-y-1 ${b.type === 'ul' ? 'list-disc' : 'list-decimal'}`}>
              {b.items.map((it, i) => <li key={i}>{inline(it, `${b.key}-${i}`)}</li>)}
            </Tag>
          );
        }
        return <p key={b.key}>{inline(b.text, b.key)}</p>;
      })}
    </div>
  );
}
