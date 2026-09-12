'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2, Cpu } from 'lucide-react';
import { authedFetch } from '@/lib/client';
import { getCategories } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MediaManager from '@/components/seller/MediaManager';
import VideoSlot from '@/components/seller/VideoSlot';
import RichTextEditor from '@/components/seller/RichTextEditor';
import CategoryPicker from '@/components/seller/CategoryPicker';
import FieldAssist from '@/components/seller/FieldAssist';
import ListingQuality from '@/components/seller/ListingQuality';

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
 * WHY THE CATEGORY LIST IS LEAVES ONLY
 *   The API refuses a parent category (validateLeafCategory), so offering one
 *   would be offering a choice that always fails.
 */
const EMPTY = {
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
    return children.length === 0 ? [{ _id: cat._id, label: path.join(' → ') }] : leavesOf(children, path);
  });

/** A small, consistent field: label above, hint below. */
function Field({ id, label, hint, aside, children, className = '' }) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {aside}
      </div>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Card({ id, title, lead, aside, children }) {
  return (
    <section id={id} className="space-y-5 rounded-xl border bg-card p-5 scroll-mt-20">
      {(title || aside) && (
        <div className="flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="font-semibold">{title}</h2>}
            {lead && <p className="mt-1 text-sm text-muted-foreground">{lead}</p>}
          </div>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export default function ProductForm({ productId, copyFromId }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [photos, setPhotos] = useState([]); // [{ src, kind: 'existing' | 'new' }], in display order
  // One optional clip: keep / replace / remove, said exactly once on save (see VideoSlot).
  const [video, setVideo] = useState({ existing: null, next: null, nextFile: null, removed: false });
  const [categories, setCategories] = useState([]);
  const [state, setState] = useState({ status: 'loading' });
  const [keywords, setKeywords] = useState('');
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
      <ListingQuality
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
        lead="Up to five. The first is the main one - white background sells best."
        aside={
          usage && (
            <p className="shrink-0 rounded-lg bg-muted px-2.5 py-1.5 text-right text-xs leading-tight text-muted-foreground">
              <span className="font-medium text-foreground">AI today</span>
              <br />
              {usage.remaining.images} photos · {usage.remaining.premiumImages} premium
              <br />
              {usage.remaining.texts} drafts
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
        title="2 · Words"
        aside={
          <Button
            type="button"
            variant="outline"
            onClick={writeForMe}
            disabled={ai.status === 'writing' || (photos.length === 0 && !form.name && !keywords.trim())}
            className="shrink-0 border-primary/40 text-brand-ink hover:bg-primary/5"
          >
            {ai.status === 'writing' ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {ai.status === 'writing' ? 'Writing…' : ai.status === 'done' ? 'Write it again' : 'Write it for me'}
          </Button>
        }
      >
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <Label htmlFor="keywords" className="text-xs text-muted-foreground">
            ✦ A photo or a few words - any language - and the AI fills 2 to 5
          </Label>
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
                <SelectItem value="auto">Automatic - Gemini, nano as backup</SelectItem>
                <SelectItem value="gemini">Gemini 3.5 Flash - best copy, daily quota</SelectItem>
                <SelectItem value="nano">gpt-5.4-nano (Pollinations) - always on, plainer</SelectItem>
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
      <Card title="3 · Category">
        <Field id="category" label="Where it sits in the shop" hint="Type to search. Shoppers browse by these, and Google reads them.">
          <CategoryPicker id="category" options={categories} value={form.category} onChange={setValue('category')} />
        </Field>
      </Card>

      {/* 4. PRICING & INVENTORY */}
      <Card title="4 · Price and stock">
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
      </Card>

      {/* 5. DETAILS THE CHANNELS NEED */}
      <Card
        title="5 · Details"
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
