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
import { Picker } from '@/components/ui/picker';
import MediaManager from '@/components/seller/MediaManager';
import VideoSlot from '@/components/seller/VideoSlot';
import RichTextEditor from '@/components/seller/RichTextEditor';
import TemplateFacts, { useListingTemplate } from '@/components/seller/TemplateFacts';
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
  processingDays: '',
  weight: '',
  color: '',
  size: '',
  variantGroupId: '',
  gender: 'female',
  ageGroup: 'adult',
  brand: '',
  sku: '',
  countryOfOrigin: 'India',
  manufacturer: '',
  netQuantity: '',
  material: '',
  highlights: '',
  productType: '',
  attributes: {},
  mfgDate: '',
  bestBefore: '',
  hsn: '',
  gstRate: '',
  freeShipping: false,
  tags: [],
};

/** The GST slabs a product can carry - only a registered shop sees the field. */
const GST_RATES = ['0', '0.25', '1.5', '3', '5', '12', '18', '28'];
const GST_ITEMS = { none: 'Not set', ...Object.fromEntries(GST_RATES.map((r) => [r, `${r}%`])) };

/*
 * Colours a shop here actually sells in (24 Sep 2026). Google asks for plain
 * colour words a shopper would use - "Rose Gold", not "RG-04" - and takes one
 * primary plus up to two secondary, so this is a starting list, not a closed
 * one: anything the seller types is kept as typed.
 */
const COLOURS = [
  'Gold', 'Rose Gold', 'Silver', 'Oxidised Silver', 'Antique Gold', 'Bronze', 'Copper',
  'White', 'Off White', 'Cream', 'Beige', 'Black', 'Grey', 'Brown', 'Tan',
  'Red', 'Maroon', 'Rani Pink', 'Pink', 'Peach', 'Orange', 'Rust', 'Mustard', 'Yellow',
  'Green', 'Bottle Green', 'Mehendi', 'Teal', 'Blue', 'Navy Blue', 'Sky Blue', 'Firozi',
  'Purple', 'Wine', 'Lavender', 'Multicolour',
];

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
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{typeof hint === 'string' ? t(hint) : hint}</p>}
    </div>
  );
}

/*
 * Every section folds (15 Sep 2026 - plan 2.39): the header keeps a one-line
 * SUMMARY of what is filled, so a folded form still reads at a glance and a
 * phone does not scroll five screens.
 *
 * ALL of them start CLOSED, on the phone and on the laptop alike (Rajat, 23
 * Sep 2026: "all the 7 cards chevron should be closed, I will open it myself").
 * The form is then one readable list of what a listing needs - seven lines
 * with their summaries - instead of a wall that has to be scrolled past. A
 * section the seller opens is remembered per section, and the score panel's
 * "Fix" link still opens the section it points at.
 */
function Card({ id, title, lead, aside, summary, defaultOpen = false, foldOnPhone = false, badge, children }) {
  const t = useT();
  const key = id || String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <Fold id={key} title={t(title)} lead={typeof lead === 'string' ? t(lead) : lead} summary={summary} aside={aside} badge={badge} defaultOpen={defaultOpen} foldOnPhone={foldOnPhone}>
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
  // Market check (21 Sep 2026): { status, data?, message? } - advice beside the price, never applied by itself.
  const [market, setMarket] = useState({ status: 'idle' });
  // The category's own questions (TemplateFacts); refetched when the category changes.
  const template = useListingTemplate(form.category);
  // Which model writes: 'auto' (Gemini, nano behind it), 'gemini', 'nano'. The
  // same rule as the photo tools - the seller always sees who is doing the work.
  const [textModel, setTextModel] = useState('auto');
  const [ai, setAi] = useState({ status: 'idle' });
  const [usage, setUsage] = useState(null);
  // Whether this shop is registered under GST - decides if the tax fields show at all.
  const [gstRegistered, setGstRegistered] = useState(false);
  // If that lookup fails the fields stay hidden - and the form says so, rather than
  // letting a registered shop save a product with no tax facts without knowing why.
  const [gstCheckFailed, setGstCheckFailed] = useState(false);

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
        // A registered shop fills HSN + GST rate so its tax invoice is right;
        // an unregistered one never sees the fields (nothing here asks anyone to register).
        authedFetch('/seller/application')
          .then((a) => !cancelled && setGstRegistered(a?.application?.gstMode === 'gstin' || Boolean(a?.application?.gstin)))
          .catch((err) => {
            console.error('GST status check failed:', err.message);
            if (!cancelled) setGstCheckFailed(true);
          });

        const load = async (id) => {
          const data = await authedFetch(`/seller/products/${id}`);
          return data.product || data;
        };

        if (productId) {
          const product = await load(productId);
          if (cancelled) return;
          setForm({ ...EMPTY, ...product, processingDays: product.processingDays ?? '', video: undefined, category: product.category?._id || product.category || '' });
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
        // The category's facts, from the photo (listing templates S2): the seller corrects, never retypes.
        productType: draft.productType || f.productType,
        attributes: draft.attributes && Object.keys(draft.attributes).length ? { ...f.attributes, ...draft.attributes } : f.attributes,
        material: draft.material || f.material,
        highlights: draft.bullets?.length && !(Array.isArray(f.highlights) ? f.highlights.length : String(f.highlights || '').trim()) ? draft.bullets.join('\n') : f.highlights,
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
        // The category's facts, from the photo (listing templates S2): the seller corrects, never retypes.
        productType: draft.productType || f.productType,
        attributes: draft.attributes && Object.keys(draft.attributes).length ? { ...f.attributes, ...draft.attributes } : f.attributes,
        material: draft.material || f.material,
        highlights: draft.bullets?.length && !(Array.isArray(f.highlights) ? f.highlights.length : String(f.highlights || '').trim()) ? draft.bullets.join('\n') : f.highlights,
      }));
      if (u) setUsage(u);
      setAi({ status: 'done', warnings: warnings || [], writtenBy });
    } catch (err) {
      setAi({ status: 'error', message: err.message });
    }
  };

  /*
   * Two ways out of this form (23 Sep 2026, Rajat: Mummy fills a listing
   * between customers). "Save for later" keeps whatever is typed and puts it
   * nowhere near the site; "List it" is the old button with all its checks.
   * Words, not a status dropdown - the seller is told what happens, not asked
   * to understand a state machine.
   */
  const submit = async (e, asDraft = false) => {
    e.preventDefault();
    if (asDraft && !String(form.name || '').trim()) {
      return setState({ status: 'error', message: 'Give it a name first - that is all a draft needs.' });
    }
    if (!asDraft && photos.length === 0) return setState({ status: 'error', message: 'Add at least one photograph.' });
    if (!asDraft && !form.category) return setState({ status: 'error', message: 'Choose a category.' });
    setState({ status: 'saving' });

    const body = {
      ...form,
      status: asDraft ? 'draft' : 'active',
      returnMode: form.returnMode || null,
      faqs: (form.faqs || []).filter((x) => x && x.q && x.a),
      price: Number(form.price),
      mrp: form.mrp === '' ? undefined : Number(form.mrp),
      stock: Number(form.stock),
      lowStockThreshold: Number(form.lowStockThreshold) || 10,
      // '' = the rulebook's dispatch time; a number = made to order, shown on the page.
      processingDays: form.processingDays === '' || form.processingDays === null ? null : Number(form.processingDays),
      weight: form.weight === '' ? undefined : Number(form.weight),
      hsn: form.hsn ?? '',
      gstRate: form.gstRate === '' || form.gstRate === null || form.gstRate === undefined ? null : Number(form.gstRate),
      size: form.size || undefined,
      variantGroupId: form.variantGroupId || undefined,
      material: form.material ?? '',
      productType: form.productType ?? '',
      attributes: form.attributes || {},
      mfgDate: form.mfgDate ?? '',
      bestBefore: form.bestBefore ?? '',
      highlights: Array.isArray(form.highlights) ? form.highlights : String(form.highlights || '').split(/\r?\n/),
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
          Another size or colour of the same product. Everything is copied except the size, the stock
          and your item code. For a new colour: change the colour, swap the photos, keep the size. All of
          them are shown together on one page - colours as photos, sizes as buttons.
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
                auto: t('Automatic - Gemini, nano as backup'),
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
                {t('{n} drafts left today', { n: usage.remaining.texts === null || usage.remaining.texts === undefined ? '∞' : usage.remaining.texts })}
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

        {/* What the shopper reads BEFORE the description (21 Sep 2026): Amazon's
            "Top highlights" and "About this item", Flipkart's "Highlights". The
            page shows them in a box beside the price; an empty field is no row. */}
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field id="material" label="Material" hint="One line, honest: “Brass with kundan stones”, “Polyester blend”, “Pure cotton”. Shoppers filter on it and Google reads it.">
            <Input id="material" value={form.material ?? ''} onChange={set('material')} maxLength={80} className="h-10" placeholder="Brass with kundan stones" />
          </Field>
          <Field id="highlights" label="Highlights (up to 5, one per line)" hint="The five things a customer asks at the counter - nickel-free, adjustable, comes in a gift box, hand wash only, set of 3.">
            <Textarea id="highlights" rows={5} value={Array.isArray(form.highlights) ? form.highlights.join('\n') : (form.highlights ?? '')} onChange={set('highlights')} placeholder={'Nickel-free, skin safe\nAdjustable chain 16-18 in\nComes in a gift box'} />
          </Field>
        </div>
      </Card>

      {/* 3. ORGANISATION */}
      <Card id="category-card" title="3 · Category" foldOnPhone summary={categories.find((c) => c._id === form.category)?.label || t('Not chosen - decides where it appears')}>
        <Field id="category" label="Where it sits in the shop" hint="Type to search. Shoppers browse by these, and Google reads them.">
          <CategoryPicker id="category" options={categories} value={form.category} onChange={setValue('category')} />
          <SuggestCategory parents={parents} />
        </Field>
      </Card>

      {/* 3b. THE CATEGORY'S FACTS (listing templates S2): what this kind of
          thing must say - dropdowns from the marketplaces' own facet values.
          The writer fills them from the photo; the seller corrects. */}
      <Card
        id="facts-card"
        title="3b · Product facts"
        foldOnPhone
        summary={template ? `${Object.values(form.attributes || {}).filter((v) => v && String(v).length).length} of ${template.attributes.length} facts${form.productType ? ` · ${form.productType}` : ''}` : t('Choose a category first')}
        lead={template ? `The facts shoppers filter on for ${template.label.toLowerCase()}. The AI fills them from the photo - check, do not retype.` : 'Pick the category above and its questions appear here.'}
      >
        <TemplateFacts
          template={template}
          productType={form.productType}
          attributes={form.attributes || {}}
          onChange={({ productType, attributes }) => setForm((f) => ({ ...f, productType, attributes }))}
          t={t}
        />
        {template && template.legal?.some((k) => ['mfgDate', 'bestBefore'].includes(k)) && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field id="mfgDate" label="Manufactured (month/year)" hint="As printed on the pack - the law asks e-commerce to show it for anything applied or consumed.">
              <Input id="mfgDate" value={form.mfgDate ?? ''} onChange={set('mfgDate')} className="h-10" placeholder="08/2026" />
            </Field>
            <Field id="bestBefore" label="Best before / use by" hint="As printed - a date or “24 months from manufacture”.">
              <Input id="bestBefore" value={form.bestBefore ?? ''} onChange={set('bestBefore')} className="h-10" placeholder="08/2028" />
            </Field>
          </div>
        )}
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

        {/* Market check: what products like this list for on Amazon/Flipkart/
            Meesho right now, and the words buyers type - one Google-grounded
            call, cached a day. Meesho's price recommendation, from the outside
            world instead of our own sales. Advice: the seller knows the
            material and the margin. */}
        <div className="mt-4 rounded-lg border border-dashed p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-medium">{t('Market check')}</span>
              <span className="text-muted-foreground"> · {t('what similar products sell for on Amazon, Flipkart and Meesho, and the words buyers type')}</span>
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!form.name || String(form.name).trim().length < 4 || market.status === 'loading'}
              onClick={async () => {
                setMarket({ status: 'loading' });
                try {
                  const data = await authedFetch('/seller/ai/market', { method: 'POST', body: { name: form.name, categoryName: categories.find((c) => c._id === form.category)?.label, material: form.material, color: form.color, price: form.price } });
                  setMarket({ status: 'done', data });
                } catch (e) {
                  setMarket({ status: 'error', message: e.message });
                }
              }}
            >
              {market.status === 'loading' ? <><Loader2 className="size-3.5 animate-spin" /> {t('Searching…')}</> : <><Sparkles className="size-3.5" /> {t('Check the market')}</>}
            </Button>
          </div>
          {market.status === 'error' && <p className="mt-2 text-sm text-destructive">{market.message}</p>}
          {market.status === 'done' && market.data && (
            <div className="mt-3 space-y-2 text-sm">
              {market.data.band ? (
                <p>
                  {t('Similar items list at')} <strong>₹{market.data.band.low.toLocaleString('en-IN')} – ₹{market.data.band.high.toLocaleString('en-IN')}</strong>
                  {market.data.band.typical ? <> · {t('most around')} ₹{market.data.band.typical.toLocaleString('en-IN')}</> : null}
                  {market.data.sources?.length ? <span className="text-muted-foreground"> ({market.data.sources.join(', ')})</span> : null}
                  {market.data.position === 'above' && <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-800 dark:text-amber-200">{t('your price is above this band')}</span>}
                  {market.data.position === 'below' && <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-800 dark:text-emerald-200">{t('your price is below this band')}</span>}
                  {market.data.position === 'inside' && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{t('your price sits inside it')}</span>}
                </p>
              ) : (
                <p className="text-muted-foreground">{t('Nothing comparable found - try a plainer title (what it is, in the words a buyer would use).')}</p>
              )}
              {market.data.note && <p className="text-muted-foreground">{market.data.note}</p>}
              {market.data.words?.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground">{t('Buyers type:')}</span>
                  {market.data.words.map((w) => {
                    const have = (form.tags || []).map((x) => String(x).toLowerCase()).includes(w);
                    return (
                      <button key={w} type="button" disabled={have} onClick={() => setForm((f) => ({ ...f, tags: [...new Set([...(f.tags || []), w])] }))} className={`rounded-full border px-2 py-0.5 text-xs ${have ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300' : 'hover:border-primary'}`} title={have ? t('Already in your search words') : t('Add to search words')}>
                        {have ? '✓ ' : '+ '}{w}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{market.data.cached ? t("From an earlier check today.") : t('Checked just now.')} {t('A guide, not a rule - you know the material and the margin.')}</p>
            </div>
          )}
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
              {t('I pay the delivery')}
            </label>
          </div>
        </div>
      
        {/*
         * Ready-to-ship time (19 Sep 2026) - Etsy's processing time, Amazon's
         * handling time. Made-to-order work says so here; the product page
         * shows it, the delivery date includes it, and the order's dispatch-by
         * date and the late clock are set from it - not from the rulebook's 2.
         */}
        <Field
          id="processingDays"
          label={t('Ready to ship in')}
          hint={t('Leave on the standard time unless this is made after the order - a name pendant, a ring to size. Say the honest number: the customer sees it before paying, and your late-dispatch clock runs from it.')}
        >
          <select id="processingDays" value={form.processingDays ?? ''} onChange={set('processingDays')} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
            <option value="">{t('Standard time (the rulebook)')}</option>
            {[3, 5, 7, 10, 14, 21, 30].map((d) => (
              <option key={d} value={d}>{t('{n} working days · made to order', { n: d })}</option>
            ))}
          </select>
        </Field>

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
          {/*
            Colour takes up to THREE, in Google's own shape: one primary and up
            to two secondary joined by a slash - "Red/Green/Black"
            (support.google.com/merchants/answer/6324487; a comma makes Google
            keep only the first). The field stays one string, so nothing
            downstream changes; the hint teaches the slash, and the shop's
            filter matches each part on its own.
          */}
          <Field id="color" label="Colour" hint={t('Up to three, the main one first. Not in the list? Type it.')}>
            {/* The seller picks; the slash is ours to write (24 Sep 2026).
                Asking a shop owner to type "Rose Gold/Green" was asking for a
                comma, and a comma is not Google's separator - nor the one our
                own colour filter splits on, so the item fell out of both. */}
            <Picker
              id="color"
              multiple
              allowCustom
              max={3}
              options={COLOURS}
              value={(form.color ?? '').split('/').map((s) => s.trim()).filter(Boolean)}
              onChange={(list) => setForm((f) => ({ ...f, color: list.join('/') }))}
              placeholder={t('Rose Gold')}
              customHint={t('or type your own')}
            />
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
          {/* What the law asks a listing to say: country of origin for everything
              (E-Commerce Rules 2020); manufacturer/packer and net quantity for
              anything sold in a pack (Legal Metrology). Said in the hint, once. */}
          <Field id="countryOfOrigin" label="Country of origin" hint="Every listing must say it (E-Commerce Rules 2020). India unless you import it.">
            <Input id="countryOfOrigin" value={form.countryOfOrigin ?? 'India'} onChange={set('countryOfOrigin')} className="h-10" />
          </Field>
          <Field id="netQuantity" label="Net quantity (packed goods)" hint="As printed on the pack - “100 g”, “Set of 4”. Needed for anything sold in a pack: electronics, cosmetics, food. Not for handmade, unpacked items.">
            <Input id="netQuantity" value={form.netQuantity ?? ''} onChange={set('netQuantity')} className="h-10" placeholder="100 g" />
          </Field>
          <Field id="manufacturer" label="Manufacturer / packer / importer (packed goods)" hint="Name and address as printed on the pack. Legal Metrology asks for it online exactly as on the box." className="sm:col-span-2">
            <Input id="manufacturer" value={form.manufacturer ?? ''} onChange={set('manufacturer')} className="h-10" placeholder="Name, city" />
          </Field>
          {/* Tax facts, for a GST-registered shop only: the invoice ShopMaster prints
              on their behalf is a tax invoice and needs the HSN and the slab per line. */}
          {gstCheckFailed && !gstRegistered && (
            <p className="text-xs text-destructive sm:col-span-2">Could not check whether your shop is GST-registered, so the HSN / GST rate fields are hidden. Reload the page before saving if you are registered.</p>
          )}
          {(gstRegistered || Boolean(form.hsn) || typeof form.gstRate === 'number') && (
            <>
              <Field id="hsn" label="HSN code" hint="From your GST invoices - 4, 6 or 8 digits (jewellery 7113, 7117).">
                <Input id="hsn" inputMode="numeric" value={form.hsn ?? ''} onChange={set('hsn')} className="h-10" placeholder="7117" />
              </Field>
              <Field id="gstRate" label="GST rate" hint="The slab you charge on this item. Prices you enter stay inclusive of it.">
                <Select items={GST_ITEMS} value={form.gstRate === null || form.gstRate === undefined || form.gstRate === '' ? 'none' : String(form.gstRate)} onValueChange={(v) => setForm((f) => ({ ...f, gstRate: v === 'none' ? '' : v }))}>
                  <SelectTrigger id="gstRate" className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {GST_RATES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}
          <Field
            id="tags"
            label="Search words"
            hint="What people type to find this - the shop's own search and Google both read them. One at a time, Enter after each."
            className="sm:col-span-2"
          >
            {/* Shopify admin's tags field: type, Enter, it becomes a chip with
                its own × (24 Sep 2026). It was one long comma-string, which on
                a phone meant editing the middle of a line of text to remove
                one word. The "Buyers type:" suggestions above add to the same
                list. */}
            <Picker
              id="tags"
              multiple
              allowCustom
              max={12}
              options={form.tags || []}
              value={form.tags || []}
              onChange={(list) => setForm((f) => ({ ...f, tags: list.map((x) => String(x).toLowerCase()) }))}
              placeholder={t('kundan choker')}
              customHint={t('type a word and press Enter')}
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
              <Button type="button" size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, faqs: [...(f.faqs || []), { q: '', a: '' }] }))}>{t('Add a question')}</Button>
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
              {faqBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {t('Draft 3 with AI')}
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

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <Button type="button" variant="outline" size="lg" disabled={state.status === 'saving'} onClick={(e) => submit(e, true)}>
          {t('Save for later')}
        </Button>
        <Button type="submit" disabled={state.status === 'saving'} size="lg">
          {state.status === 'saving' ? t('Saving…') : productId ? t('Save changes') : t('List it')}
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
