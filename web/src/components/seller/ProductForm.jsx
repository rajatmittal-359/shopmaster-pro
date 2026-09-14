'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2, Cpu } from 'lucide-react';
import { authedFetch } from '@/lib/client';
import { toast } from 'sonner';
import { getCategories } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MediaManager from '@/components/seller/MediaManager';
import VideoSlot from '@/components/seller/VideoSlot';
import RichTextEditor from '@/components/seller/RichTextEditor';
import CategoryPicker from '@/components/seller/CategoryPicker';
import FieldAssist from '@/components/seller/FieldAssist';
import Fold from '@/components/panel/Fold';
import MicButton from '@/components/voice/MicButton';
import { useLang } from '@/lib/i18n';
import ListingQuality from '@/components/seller/ListingQuality';
import SuggestCategory from '@/components/seller/SuggestCategory';
import { useT } from '@/lib/i18n';

/**
 * Listing something for sale.
 *
 * THE SHAPE, FROM THE REFERENCES
 *   Shopify's product form, in its order: media first, then title and
 *   description, then organisation (category), then pricing, inventory and
 *   shipping, then the details a channel needs. Amazon adds the discipline on
 *   photographs: numbered slots, MAIN first, white background there, product
 *   filling the frame. This form is those two, at the size of a shop with
 *   five photos and no variants tab.
 *
 * WHAT THE AI IS HERE, AND WHAT IT IS NOT
 *   A seller takes a normal photo and uploads it - that is theirs to do, and
 *   the form works entirely without AI. The AI is offered in two places, both
 *   visible and both optional: on every photo (white background, in use,
 *   another angle, or a scene they describe), and once at the top - "Write
 *   it for me" - which fills the words from the first photo. Everything it
 *   produces is a draft the seller sees and changes before saving.
 *
 * WHY COLOUR, GENDER AND AGE GROUP ARE HERE AT ALL
 *   Google requires them for free listings in category 166 (jewellery and
 *   accessories). A product created without a colour is one Merchant Center
 *   holds in "Under review", silently. Seventeen of ours sat there.
 *
 * "BOL KE LISTING" (13 Sep 2026, plan 2.18)
 *   The mic beside "Write it for me". The shopkeeper says "oxidised silver ka
 *   kada, 1250 rupaye, MRP 1800, 5 piece, free size" - the numbers land in
 *   price/MRP/stock/size, the words become the listing through the same
 *   draft road as the photo. What was heard is shown above the fields, so a
 *   wrong number is seen before it is saved. Built for the person who
 *   would rather talk than type; the photo road and the typed road are
 *   unchanged.
 *
 * WHY THE CATEGORY LIST IS LEAVES ONLY
 *   The API refuses a parent category (validateLeafCategory), so offering one
 *   would be offering a choice that always fails.
 */
/* An exempt account has no cap: show ∞, not a blank. */
const left = (n) => (n === null || n === undefined ? '∞' : n);

const EMPTY = {
  returnMode: '',
  faqs: [],
  name: '',
  description: '',
  category: '',
  price: '',
  mrp: '',
  stock: '',
  lowStockThreshold: 10,
  weight: '',
  color: '',
  size: '',
  variantGroupId: '',
  gender: 'female',
  ageGroup: 'adult',
  brand: '',
  sku: '',
  freeShipping: false,
  tags: [],
};

const GENDERS = { female: 'Women', male: 'Men', unisex: 'Anyone' };
const AGES = { adult: 'Adult', kids: 'Kids', toddler: 'Toddler', infant: 'Infant', newborn: 'Newborn' };

/** Depth-first, keeping only categories that have no children. */
const leavesOf = (categories, trail = []) =>
  categories.flatMap((cat) => {
    const path = [...trail, cat.name];
    const children = cat.children || [];
    return children.length === 0 ? [{ _id: cat._id, label: path.join(' → '), returnMode: cat.returnMode || 'R', returnModesAllowed: cat.returnModesAllowed || ['R', 'X', 'N'] }] : leavesOf(children, path);
  });

/* Fair Returns (plan §4.39): what the item promises. Wrong / damaged / faulty is covered whatever is chosen - law. */
const RETURN_MODES = {
  R: ['Return or exchange', '7 days, tag on, unused. The default most shops use.'],
  X: ['Exchange only', 'Size or colour swap; no refund for a change of mind.'],
  N: ['No return', 'Hygiene, custom or made-to-order. Wrong, damaged or faulty is still covered.'],
};

/** A small, consistent field: label above, hint below. */
function Field({ id, label, hint, aside, children, className = '' }) {
  const t = useT();
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{typeof label === 'string' ? t(label) : label}</Label>
        {aside}
      </div>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

/*
 * Every section folds (15 Sep 2026 - plan 2.39): the header keeps a one-line
 * SUMMARY of what is filled, so a folded form still reads at a glance and a
 * phone does not scroll five screens. Essential sections open; optional ones
 * (Q&A) start folded with their summary. The choice is remembered per section.
 */
function Card({ id, title, lead, aside, summary, defaultOpen = true, foldOnPhone = false, badge, children }) {
  const t = useT();
  const key = id || String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <Fold id={key} title={t(title)} lead={lead} summary={summary} aside={aside} badge={badge} defaultOpen={defaultOpen} foldOnPhone={foldOnPhone}>
      {children}
    </Fold>
  );
}

export default function ProductForm({ productId, copyFromId }) {
  const t = useT();
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [photos, setPhotos] = useState([]); // [{ src, kind: 'existing' | 'new' }], in display order
  // One optional clip: keep / replace / remove, said exactly once on save (see VideoSlot).
  const [video, setVideo] = useState({ existing: null, next: null, nextFile: null, removed: false });
  const [categories, setCategories] = useState([]);
  const [parents, setParents] = useState([]);
  const [state, setState] = useState({ status: 'loading' });
  const [keywords, setKeywords] = useState('');
  const [faqBusy, setFaqBusy] = useState(false);
  // Which model writes: 'auto' (Gemini, nano behind it), 'gemini', 'nano'. The
  // same rule as the photo tools - the seller always sees who is doing the work.
  const [textModel, setTextModel] = useState('auto');
  const [ai, setAi] = useState({ status: 'idle' });
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tree = await getCategories();
        if (cancelled) return;
        setCategories(leavesOf(tree));
        setParents(tree.map((c) => ({ _id: c._id, name: c.name })));

        // Today's AI allowance. A failure here must not block the form.
        authedFetch('/seller/ai/usage')
          .then((u) => !cancelled && setUsage(u))
          .catch(() => {});

        const load = async (id) => {
          const data = await authedFetch(`/seller/products/${id}`);
          return data.product || data;
        };

        if (productId) {
          const product = await load(productId);
          if (cancelled) return;
          setForm({ ...EMPTY, ...product, video: undefined, category: product.category?._id || product.category || '' });
          setPhotos((product.images || []).map((src) => ({ src, kind: 'existing' })));
          setVideo({ existing: product.video?.url ? product.video : null, next: null, nextFile: null, removed: false });
        } else if (copyFromId) {
          /*
           * Another size of an existing product. Everything about the style is
           * copied and only what genuinely differs is cleared: the size, the
           * stock, the seller's own code. Both rows carry the same group id so
           * the feed and the product page know they are siblings.
           */
          const source = await load(copyFromId);
          if (cancelled) return;
          setForm({
            ...EMPTY,
            ...source,
            category: source.category?._id || source.category || '',
            size: '',
            stock: '',
            sku: '',
            variantGroupId: source.variantGroupId || String(source._id),
          });
          setPhotos((source.images || []).map((src) => ({ src, kind: 'existing' })));
        }
        setState({ status: 'idle' });

        // A link from the products list ("54/100 · Add a photo +10") carries
        // the section or field as the hash. Open its fold and scroll to it
        // once the product is on screen - the same door the health bar uses.
        const hash = window.location.hash.slice(1);
        if (hash) {
          setTimeout(() => {
            const el = document.getElementById(hash);
            if (!el) return;
            window.dispatchEvent(new CustomEvent('smp:reveal', { detail: el.id }));
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 150);
        }
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, copyFromId]);

  const set = (key) => (e) =>
    setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setValue = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const lang = useLang();
  const [heard, setHeard] = useState('');

  /* The spoken road: transcript → numbers into the form, words into the draft. */
  const listFromSpeech = async (transcript) => {
    if (!transcript?.trim()) return;
    setHeard(transcript);
    setAi({ status: 'writing' });
    try {
      const first = photos[0];
      const body = {
        transcript,
        categoryId: form.category || undefined,
        ...(first?.kind === 'existing' ? { imageUrl: first.src } : {}),
        ...(first?.kind === 'new' ? { imageDataUrl: first.src } : {}),
        textModel,
      };
      const { draft, warnings, usage: u, writtenBy } = await authedFetch('/seller/ai/listing-from-speech', { method: 'POST', body });
      setForm((f) => ({
        ...f,
        name: draft.name || f.name,
        description: draft.description || f.description,
        category: draft.categoryId || f.category,
        price: draft.price ?? f.price,
        mrp: draft.mrp ?? f.mrp,
        stock: draft.stock ?? f.stock,
        color: draft.color || f.color,
        size: draft.size || f.size,
        gender: draft.gender || f.gender,
        ageGroup: draft.ageGroup || f.ageGroup,
        tags: draft.tags?.length ? draft.tags : f.tags,
      }));
      if (u) setUsage(u);
      setAi({ status: 'done', warnings: warnings || [], writtenBy });
    } catch (err) {
      setAi({ status: 'error', message: err.message });
    }
  };

  const writeForMe = async () => {
    setAi({ status: 'writing' });
    try {
      const first = photos[0];
      const body = {
        name: form.name,
        keywords,
        price: form.price ? Number(form.price) : undefined,
        categoryId: form.category || undefined,
        ...(first?.kind === 'existing' ? { imageUrl: first.src } : {}),
        ...(first?.kind === 'new' ? { imageDataUrl: first.src } : {}),
        textModel,
      };
      const { draft, warnings, usage: u, writtenBy } = await authedFetch('/seller/ai/listing', { method: 'POST', body });
      setForm((f) => ({
        ...f,
        name: draft.name || f.name,
        description: draft.description || f.description,
        category: draft.categoryId || f.category,
        color: draft.color || f.color,
        size: draft.size || f.size,
        gender: draft.gender || f.gender,
        ageGroup: draft.ageGroup || f.ageGroup,
        tags: draft.tags?.length ? draft.tags : f.tags,
      }));
      if (u) setUsage(u);
      setAi({ status: 'done', warnings: warnings || [], writtenBy });
    } catch (err) {
      setAi({ status: 'error', message: err.message });
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (photos.length === 0) return setState({ status: 'error', message: 'Add at least one photograph.' });
    if (!form.category) return setState({ status: 'error', message: 'Choose a category.' });
    setState({ status: 'saving' });

    const body = {
      ...form,
      returnMode: form.returnMode || null,
      faqs: (form.faqs || []).filter((x) => x && x.q && x.a),
      price: Number(form.price),
      mrp: form.mrp === '' ? undefined : Number(form.mrp),
      stock: Number(form.stock),
      lowStockThreshold: Number(form.lowStockThreshold) || 10,
      weight: form.weight === '' ? undefined : Number(form.weight),
      size: form.size || undefined,
      variantGroupId: form.variantGroupId || undefined,
      // In display order. The server keeps URLs that are ours and uploads the rest.
      images: photos.map((p) => p.src),
      // A data URL replaces, null removes, undefined keeps - the server's contract.
      video: video.next ? video.next : video.removed ? null : undefined,
    };

    try {
      if (productId) {
        await authedFetch(`/seller/products/${productId}`, { method: 'PATCH', body });
      } else {
        await authedFetch('/seller/products', { method: 'POST', body });
        if (copyFromId && body.variantGroupId) {
          await authedFetch(`/seller/products/${copyFromId}`, {
            method: 'PATCH',
            body: { variantGroupId: body.variantGroupId },
          });
        }
      }
      router.push('/seller/products');
      router.refresh();
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  if (state.status === 'loading') return <p className="text-muted-foreground">Loading…</p>;

  const errorLine = (message) => setState((s) => ({ ...s, status: message ? 'error' : 'idle', message }));

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-5">
      {copyFromId && (
        <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
          Another size of an existing product. Everything is copied except the size, the stock and
          your item code - and both sizes are shown together on one page.
        </p>
      )}

      {/* THE SCORE. Live, from the form; the three biggest fixes on top, each a
          jump to its field; AI search words; a Google preview; and for a saved
          product Google's own verdicts. Amazon's Listing Quality, at our size. */}
      {/* The health bar: a ring, one word, the next fix. The rest of Google
          (search words, preview, verdicts) is section 7, folded, at the end. */}
      <ListingQuality
        part="bar"
        form={form}
        photos={photos}
        productId={productId}
        categoryLabel={categories.find((c) => c._id === form.category)?.label}
        needsSize={/cloth|fashion|footwear|shoe|kurt|saree|dress|apparel|wear|trouser|shirt|jeans/i.test(categories.find((c) => c._id === form.category)?.label || '')}
        textModel={textModel}
        onAddTags={(words) => setForm((f) => ({ ...f, tags: [...new Set([...(f.tags || []), ...words])] }))}
      />

      {/* 1. MEDIA */}
      <Card
        id="photos"
        title="1 · Photos"
        summary={photos.length ? t(photos.length > 1 ? '{n} photos · first is the main one' : '1 photo · the main one', { n: photos.length }) : t('No photo yet - the one thing nothing sells without')}
        lead="Up to five. The first is the main one - white background sells best."
        aside={
          usage && (
            <p className="shrink-0 rounded-lg bg-muted px-2.5 py-1.5 text-right text-xs leading-tight text-muted-foreground">
              <span className="font-medium text-foreground">AI today</span>
              <br />
              {left(usage.remaining.images)} photos · {left(usage.remaining.premiumImages)} premium
              <br />
              {left(usage.remaining.texts)} drafts
            </p>
          )
        }
      >
        <MediaManager
          photos={photos}
          onChange={setPhotos}
          productName={form.name || 'product'}
          onUsage={setUsage}
          onError={errorLine}
        />
        <VideoSlot value={video} onChange={setVideo} />
      </Card>

      {/* 2. WORDS */}
      <Card
        id="words"
        title="2 · Words"
        summary={form.name ? t('{name} · {n} words', { name: form.name.slice(0, 60), n: String(form.description || '').replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length }) : t('Title and description - or say it, or let AI write it from the photo')}
        aside={
          <div className="flex shrink-0 items-center gap-2">
            {/* Say it: the mic writes the numbers and the words at once. */}
            <MicButton role="seller" language={lang === 'en' ? 'auto' : lang} onText={listFromSpeech} label={t('Say the product, price and stock')} />
            <Button
              type="button"
              variant="outline"
              onClick={writeForMe}
              disabled={ai.status === 'writing' || (photos.length === 0 && !form.name && !keywords.trim())}
              className="border-primary/40 text-brand-ink hover:bg-primary/5"
            >
              {ai.status === 'writing' ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {ai.status === 'writing' ? t('Writing…') : ai.status === 'done' ? t('Write it again') : t('Write it for me')}
            </Button>
          </div>
        }
      >
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <Label htmlFor="keywords" className="text-xs text-muted-foreground">
            ✦ {t('A photo, a few words, or just say it (mic) - any language - and the AI fills 2 to 5')}
          </Label>
          {heard && (
            <p className="mt-1.5 rounded-md bg-background px-2 py-1 text-xs text-muted-foreground">
              {t('Heard')}: <span className="text-foreground">“{heard}”</span>
            </p>
          )}
          <Input
            id="keywords"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="kundan, bridal, green stone · or: cotton kurti, block print, summer"
            className="mt-1.5 bg-background"
          />
          {/* WHICH MODEL WRITES - the same chip idea as the photo tools: the
              choice, and what is left today, in the same place as the action. */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Cpu className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Writer:</span>
            <Select
              items={{
                auto: 'Automatic - Gemini, nano as backup',
                gemini: 'Gemini 3.5 Flash',
                nano: 'gpt-5.4-nano (Pollinations)',
              }}
              value={textModel}
              onValueChange={setTextModel}
            >
              <SelectTrigger className="h-7 min-w-52 text-xs" aria-label="Which model writes the listing">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automatic - best available (Gemini → Groq → Cloudflare → nano)</SelectItem>
                <SelectItem value="gemini">Gemini only - best copy, small daily quota</SelectItem>
                <SelectItem value="nano">nano only - always on, plainer</SelectItem>
              </SelectContent>
            </Select>
            {usage && (
              <span className="text-muted-foreground">
                {usage.remaining.texts === null || usage.remaining.texts === undefined ? '∞' : usage.remaining.texts} drafts left today
              </span>
            )}
          </div>
          {ai.status === 'done' && (
            <p className="mt-2 text-sm text-brand-ink">
              Filled in below. Read it, change what is wrong, then save.
              {ai.writtenBy && <span className="text-muted-foreground"> Written by {ai.writtenBy}.</span>}
              {ai.warnings?.length > 0 && (
                <span className="block text-muted-foreground">{ai.warnings.join(' ')}</span>
              )}
            </p>
          )}
          {ai.status === 'error' && <p className="mt-2 text-sm text-destructive">{ai.message}</p>}
        </div>

        <Field
          id="name"
          label="Title"
          hint="Put the colour in it if there is one - “Rose Gold Pearl Ring”. It is the first thing a shopper reads and the first thing Google matches."
          aside={
            <FieldAssist
              field="name"
              value={form.name}
              onChange={(v) => setForm((f) => ({ ...f, name: v }))}
              context={{ name: form.name, categoryName: categories.find((c) => c._id === form.category)?.label }}
              textModel={textModel}
            />
          }
        >
          <Input id="name" required value={form.name} onChange={set('name')} className="h-10" />
        </Field>

        <Field
          id="description"
          label="Description"
          hint="Two or three short paragraphs. What it is, what it goes with, when to wear or use it. Bullets for the details. Write in any language - Improve can turn it into English."
          aside={
            <FieldAssist
              field="description"
              value={form.description}
              onChange={(v) => setForm((f) => ({ ...f, description: v }))}
              context={{ name: form.name, categoryName: categories.find((c) => c._id === form.category)?.label }}
              textModel={textModel}
            />
          }
        >
          <RichTextEditor
            id="description"
            value={form.description}
            onChange={setValue('description')}
            placeholder="Describe it the way you would to a customer standing in front of you…"
          />
        </Field>
      </Card>

      {/* 3. ORGANISATION */}
      <Card id="category-card" title="3 · Category" foldOnPhone summary={categories.find((c) => c._id === form.category)?.label || t('Not chosen - decides where it appears')}>
        <Field id="category" label="Where it sits in the shop" hint="Type to search. Shoppers browse by these, and Google reads them.">
          <CategoryPicker id="category" options={categories} value={form.category} onChange={setValue('category')} />
          <SuggestCategory parents={parents} />
        </Field>
      </Card>

      {/* 4. PRICING & INVENTORY */}
      <Card
        id="price-card"
        title="4 · Price and stock"
        foldOnPhone
        summary={`${form.price ? `₹${form.price}` : t('No price')} · ${form.stock !== '' && form.stock !== undefined ? t('{n} in stock', { n: form.stock }) : t('stock?')}${form.weight ? ` · ${form.weight} g` : ''} · ${t({ R: 'return + refund', X: 'exchange only', N: 'no return' }[form.returnMode] || 'category return rule')}`}
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <Field id="price" label="Selling price (₹)">
            <Input id="price" required inputMode="numeric" value={form.price} onChange={set('price')} className="h-10" />
          </Field>
          <Field
            id="mrp"
            label="MRP (₹)"
            hint="The price printed on the pack - legally the most it may be sold for, not a bigger number to flatter the discount."
          >
            <Input id="mrp" inputMode="numeric" value={form.mrp ?? ''} onChange={set('mrp')} className="h-10" />
          </Field>
          <Field id="stock" label="How many">
            <Input id="stock" required inputMode="numeric" value={form.stock} onChange={set('stock')} className="h-10" />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field id="weight" label="Parcel weight (kg)" hint="The courier is quoted on this. Guessing low costs you the difference at the door.">
            <Input id="weight" inputMode="decimal" value={form.weight ?? ''} onChange={set('weight')} className="h-10" />
          </Field>
          <Field id="lowStockThreshold" label="Warn me at">
            <Input
              id="lowStockThreshold"
              inputMode="numeric"
              value={form.lowStockThreshold ?? 10}
              onChange={set('lowStockThreshold')}
              className="h-10"
            />
          </Field>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(form.freeShipping)}
                onChange={set('freeShipping')}
                className="size-4 accent-primary"
              />
              I pay the delivery
            </label>
          </div>
        </div>
      
        {/* The return promise, inside what the category allows. Shown on the product page before anyone buys. */}
        {(() => {
          const cat = categories.find((c) => c._id === form.category);
          const allowed = cat?.returnModesAllowed || ['R', 'X', 'N'];
          const def = cat?.returnMode || 'R';
          return (
            <fieldset className="mt-4">
              <legend className="text-sm font-medium">{t('Returns on this item')}</legend>
              <p className="mb-2 text-xs text-muted-foreground">{t('Wrong, damaged or faulty is always returnable - that is the law. This is about a change of mind.')}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {['R', 'X', 'N'].map((m) => {
                  const ok = allowed.includes(m);
                  const checked = (form.returnMode || def) === m;
                  return (
                    <label key={m} className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm has-[:checked]:border-primary ${ok ? '' : 'opacity-50'}`}>
                      <input type="radio" name="returnMode" disabled={!ok} checked={checked} onChange={() => setForm((f) => ({ ...f, returnMode: m === def ? '' : m }))} className="mt-1" />
                      <span>
                        <strong>{t(RETURN_MODES[m][0])}</strong>{m === def ? <span className="ml-1 text-xs text-muted-foreground">({t('category default')})</span> : null}
                        <span className="block text-xs text-muted-foreground">{t(RETURN_MODES[m][1])}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })()}
      </Card>



      {/* 5. DETAILS THE CHANNELS NEED */}
      <Card
        id="details"
        title="5 · Details"
        foldOnPhone
        summary={[form.color, form.size, form.gender && form.gender !== 'unisex' ? form.gender : null, form.material].filter(Boolean).join(' · ') || t('Colour, size, who it is for - Google Shopping needs these')}
        lead="Colour, who it is for and age group put it on Google Shopping for free."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="color" label="Colour">
            <Input id="color" value={form.color ?? ''} onChange={set('color')} placeholder="Rose Gold" className="h-10" />
          </Field>
          <Field
            id="size"
            label="Size"
            hint="Clothing and shoes only - Google requires it for those. Write what is on the label (“M”, “38”). Leave empty for jewellery."
          >
            <Input id="size" value={form.size ?? ''} onChange={set('size')} placeholder="M" className="h-10" />
          </Field>

          <Field id="gender" label="Made for">
            <Select items={GENDERS} value={form.gender ?? 'female'} onValueChange={setValue('gender')}>
              <SelectTrigger id="gender" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(GENDERS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="ageGroup" label="Age group">
            <Select items={AGES} value={form.ageGroup ?? 'adult'} onValueChange={setValue('ageGroup')}>
              <SelectTrigger id="ageGroup" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(AGES).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="brand" label="Brand" hint="Optional. Leave it empty if there is no brand on the product.">
            <Input id="brand" value={form.brand ?? ''} onChange={set('brand')} className="h-10" />
          </Field>
          <Field id="sku" label="Your own item code" hint="Whatever you use in your own stock book.">
            <Input id="sku" value={form.sku ?? ''} onChange={set('sku')} className="h-10" />
          </Field>
          <Field
            id="tags"
            label="Search words"
            hint="What people type to find this - the shop's own search and Google both read them. Commas between."
            className="sm:col-span-2"
          >
            <Input
              id="tags"
              value={(form.tags || []).join(', ')}
              onChange={(e) =>
                setForm((f) => ({ ...f, tags: e.target.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) }))
              }
              placeholder="kundan choker, bridal choker, green stone choker"
              className="h-10"
            />
          </Field>
        </div>
      </Card>

      {/* Q&A under the product (plan 2.32). AI overviews and shopping assistants
          quote pages that answer plainly; Amazon's Q&A and Etsy's FAQ do the same
          job. Drafted from the facts and the rulebook, kept by the seller. */}
      <Card
        id="faqs"
        title="6 · Questions shoppers ask"
        defaultOpen={false}
        badge={<span className="rounded bg-muted px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{t('Optional')}</span>}
        summary={(form.faqs || []).filter((x) => x.q && x.a).length ? t('{n} answers', { n: (form.faqs || []).filter((x) => x.q && x.a).length }) : t('None yet - two short answers help AI answers quote you')}
        lead="2-6 short answers: material · care · size · in the box · delivery. Google's AI answers quote these."
      >
        <div className="space-y-3">
          {(form.faqs || []).map((x, idx) => (
            <div key={idx} className="rounded-lg border p-3">
              <Input value={x.q} maxLength={120} placeholder="Question, e.g. Is this real silver?" onChange={(e) => setForm((f) => ({ ...f, faqs: f.faqs.map((y, k) => (k === idx ? { ...y, q: e.target.value } : y)) }))} />
              <Textarea value={x.a} maxLength={400} rows={2} className="mt-2" placeholder="Answer in one or two plain sentences" onChange={(e) => setForm((f) => ({ ...f, faqs: f.faqs.map((y, k) => (k === idx ? { ...y, a: e.target.value } : y)) }))} />
              <button type="button" className="mt-1 text-xs text-muted-foreground hover:text-destructive" onClick={() => setForm((f) => ({ ...f, faqs: f.faqs.filter((_, k) => k !== idx) }))}>Remove</button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {(form.faqs || []).length < 6 && (
              <Button type="button" size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, faqs: [...(f.faqs || []), { q: '', a: '' }] }))}>Add a question</Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!form.name || faqBusy}
              onClick={async () => {
                setFaqBusy(true);
                try {
                  const r = await authedFetch('/seller/ai/faqs', { method: 'POST', body: { name: form.name, description: form.description, categoryName: categories.find((c) => c._id === form.category)?.label, material: form.material, color: form.color, size: form.size, returnMode: form.returnMode || categories.find((c) => c._id === form.category)?.returnMode || 'R', textModel } });
                  const have = new Set((form.faqs || []).map((x) => x.q.trim().toLowerCase()));
                  const fresh = (r.faqs || []).filter((x) => !have.has(x.q.trim().toLowerCase()));
                  setForm((f) => ({ ...f, faqs: [...(f.faqs || []).filter((x) => x.q || x.a), ...fresh].slice(0, 6) }));
                  toast.success(`${fresh.length} drafted by ${r.writtenBy} - read them, they are yours now`);
                } catch (e) {
                  toast.error(e.message);
                } finally {
                  setFaqBusy(false);
                }
              }}
            >
              {faqBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Draft 3 with AI
            </Button>
          </div>
        </div>
      </Card>

      <Card
        id="google"
        title="7 · Google"
        defaultOpen={false}
        badge={<span className="rounded bg-muted px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{t('Optional')}</span>}
        summary={`${t('{n} search words · how it looks in Google', { n: (form.tags || []).length })}${productId ? ` · ${t("Google's own verdicts")}` : ''}`}
      >
        <ListingQuality
          part="google"
          form={form}
          photos={photos}
          productId={productId}
          categoryLabel={categories.find((c) => c._id === form.category)?.label}
          needsSize={/cloth|fashion|footwear|shoe|kurt|saree|dress|apparel|wear|trouser|shirt|jeans/i.test(categories.find((c) => c._id === form.category)?.label || '')}
          textModel={textModel}
          onAddTags={(words) => setForm((f) => ({ ...f, tags: [...new Set([...(f.tags || []), ...words])] }))}
        />
      </Card>

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <Button type="submit" disabled={state.status === 'saving'} size="lg">
          {state.status === 'saving' ? 'Saving…' : productId ? 'Save changes' : 'List it'}
        </Button>
        <Button type="button" onClick={() => router.push('/seller/products')} variant="ghost">
          Cancel
        </Button>
        <p aria-live="polite" className="text-sm">
          {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
        </p>
      </div>
    </form>
  );
}
