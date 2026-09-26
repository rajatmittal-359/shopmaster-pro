'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Picker } from '@/components/ui/picker';
import MediaManager from '@/components/seller/MediaManager';
import VideoSlot from '@/components/seller/VideoSlot';
import RichTextEditor from '@/components/seller/RichTextEditor';
import TemplateFacts, { useListingTemplate } from '@/components/seller/TemplateFacts';
import CategoryPicker from '@/components/seller/CategoryPicker';
import FormRail from '@/components/seller/FormRail';
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

/**
 * A small, consistent field: label above, hint below.
 *
 * `req` marks the five the SERVER refuses a listing without - name,
 * description, category, price, stock (`models/Product.js`, where they are
 * `required: [notWhileDraft, …]`). Added 26 Sep 2026 after Rajat asked for the
 * asterisk. It is deliberately tied to the model rather than sprinkled by
 * taste: a star on a field the server would have accepted is a lie, and a
 * missing star on one it refuses is worse - which is exactly what was
 * happening to DESCRIPTION and CATEGORY. Both were required by the model and
 * neither was marked or validated in the browser, so a seller only found out
 * when "List it" came back with a 400.
 *
 * "Save for later" saves a draft and needs none of them - that is what
 * `notWhileDraft` means - so the asterisk is explained once, in the footer,
 * as "needed to list" rather than "needed to save".
 */
function Field({ id, label, hint, aside, req = false, children, className = '' }) {
  const t = useT();
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>
          {typeof label === 'string' ? t(label) : label}
          {req && (
            <span className="text-destructive" title={t('Needed to list this product')}>
              *<span className="sr-only"> {t('required')}</span>
            </span>
          )}
        </Label>
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
/**
 * Is this form editing an existing product, or filling a new one? The cards
 * behave differently, so they have to know.
 */
const EditingContext = createContext(false);

/*
 * NEW product: every card shut, every time. EDIT: open, and remembered.
 *
 * Rajat, after using it: *"new product add karte time har time band mile"* -
 * and separately, *"edit mode me khule mil sakte hai"*. Two different jobs:
 *
 *   Adding is a repeated ritual. It should start identically every time, so
 *   the seller's hands learn one shape - not whatever they happened to leave
 *   open on the last listing. So the memory is switched OFF here entirely
 *   (Fold's `remember`), otherwise opening Price once would reopen it on
 *   every product forever.
 *
 *   Editing is the opposite: you came to look at what is already there, so
 *   the sections are open and your choice IS remembered.
 *
 * Briefly tried Shopify's way - always open, everywhere - because their
 * product page folds only the optional "Search engine listing". Rajat looked
 * at it and said no, and for his catalogue he is right: a seller listing
 * their tenth kurta opens the two sections they are changing. Each closed
 * card still carries its summary ("3 photos · first is the main one",
 * "₹450 · 5 in stock"), and the rail above carries the orientation.
 *
 * Sections 7 and 8 pass defaultOpen={false} explicitly - they are the
 * optional ones and stay shut in both modes.
 */
function Card({ id, title, lead, aside, summary, defaultOpen, foldOnPhone = false, badge, req = false, children }) {
  const t = useT();
  const editing = useContext(EditingContext);
  const key = id || String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  /*
   * `req` puts the same asterisk on a whole SECTION that `Field` puts on one
   * input - used by Photos, which has no single field to mark and which
   * `submit` refuses a listing without. It rides in as the badge rather than
   * into the title, because the title is a translation key and adding a star
   * to the string would orphan the Hindi and Hinglish entries.
   */
  const mark = req ? (
    <span className="text-destructive" title={t('Needed to list this product')}>
      *<span className="sr-only"> {t('required')}</span>
    </span>
  ) : null;
  return (
    <Fold
      id={key}
      title={t(title)}
      lead={typeof lead === 'string' ? t(lead) : lead}
      summary={summary}
      aside={aside}
      badge={
        mark && badge ? (
          <>
            {mark}
            {badge}
          </>
        ) : (mark ?? badge)
      }
      defaultOpen={defaultOpen ?? editing}
      remember={editing}
      foldOnPhone={foldOnPhone}
    >
      {children}
    </Fold>
  );
}

export default function ProductForm({ productId, copyFromId }) {
  const t = useT();
  const router = useRouter();
  const [importing, setImporting] = useState({ url: '', busy: false, error: '' });
  /*
   * WORK IS NOT THROWN AWAY WITHOUT ASKING (26 Sep 2026).
   *
   * Rajat: "cancel ya back karte waqt ekdum se ho jata hai, kuch puchhna nahi
   * hota - seller ne itni info bhari aur galti se back ho gaya to mehnat bekar".
   * He is right, and on a phone the back GESTURE is the likely accident, not
   * the button. So: a snapshot of the form as it was loaded, a comparison
   * against it, and three ways out of the dialog - keep it as a draft, throw
   * it away, or carry on. Shopify's admin and Amazon's listing form both ask;
   * neither offers to save it for you, which is the one thing we can do
   * better because "Save for later" already exists.
   */
  const [leaving, setLeaving] = useState(null); // null | 'cancel' | 'back'
  const loadedSnapshot = useRef(null);
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
   * IS THERE ANYTHING TO LOSE?
   *
   * A signature rather than a deep compare: the photographs can be megabytes
   * of base64, and stringifying those on every render to answer a yes/no
   * question would cost more than the question is worth.
   */
  const signature = JSON.stringify({
    f: form,
    p: photos.map((x) => String(x.src).slice(0, 64)),
    v: Boolean(video.next || video.removed),
  });
  useEffect(() => {
    // The first settled render after loading is "how it was given to us".
    if (loadedSnapshot.current === null && state.status !== 'loading') loadedSnapshot.current = signature;
  }, [signature, state.status]);
  // A save navigates away by itself, so there is no 'saved' state to test for.
  const dirty = loadedSnapshot.current !== null && signature !== loadedSnapshot.current;

  /*
   * The browser's own question, for the tab being closed, reloaded, or taken
   * somewhere outside the app. The wording is the browser's; we only say that
   * there is something to lose.
   */
  useEffect(() => {
    if (!dirty) return undefined;
    const ask = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [dirty]);

  /*
   * And the one that actually happens on a phone: the BACK gesture. It never
   * reaches `beforeunload` - it is a move inside the app - so a sentinel entry
   * is pushed while there is work to lose, and the first Back lands on it
   * instead of leaving the form. The dialog then decides what happens.
   */
  useEffect(() => {
    if (!dirty) return undefined;
    window.history.pushState(null, '', window.location.href);
    const onPop = () => {
      window.history.pushState(null, '', window.location.href);
      setLeaving('back');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [dirty]);

  /** Leaving for real: the guard is off, so no dialog on the way out. */
  const leaveNow = () => {
    loadedSnapshot.current = signature;
    setLeaving(null);
    setTimeout(() => router.push('/seller/products'), 0);
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
    /*
     * The starred fields, refused here rather than by the server.
     *
     * Every card is closed by default, so an error message on its own leaves
     * the seller hunting for which of eight sections is wrong. `smp:reveal`
     * is what the rail and the score already use: it opens the folded card
     * and then the scroll lands on something.
     *
     * DESCRIPTION was the one genuinely missing (26 Sep 2026). The model has
     * required: [notWhileDraft] on it, the browser had no `required` for it
     * because it is a rich-text editor and not an <input>, so "List it" went
     * to the server and came back a 400 with nothing pointing at the field.
     */
    const refuse = (message, sectionId) => {
      if (sectionId) {
        window.dispatchEvent(new CustomEvent('smp:reveal', { detail: sectionId }));
        requestAnimationFrame(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
      setState({ status: 'error', message });
      return undefined;
    };

    if (!asDraft && photos.length === 0) return refuse('Add at least one photograph.', 'photos');
    if (!asDraft && !String(form.description || '').replace(/<[^>]*>/g, '').trim()) {
      return refuse('Write a description - it is what the shopper reads before deciding.', 'words');
    }
    if (!asDraft && !form.category) return refuse('Choose a category.', 'category-card');
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
      /*
       * WEIGHT: warned about, never blocked (26 Sep 2026).
       *
       * 24 of the 28 live products have no weight, and every courier quote
       * for them is a guess - the courier bills the real weight either way,
       * so the difference comes out of the seller's money. It is the biggest
       * single gap in the catalogue and it is invisible, because nothing ever
       * said it out loud at the moment it was created.
       *
       * Not a hard stop, on purpose: a seller who cannot list until they find
       * a weighing scale simply does not list. So the listing goes through
       * and the cost is named once, with the fix one tap away. This is the
       * honest version of the enforcement we decided against - see
       * FRONTEND-PLAN 4.58.
       */
      if (!asDraft && !(Number(form.weight) > 0)) {
        toast.warning(t('Listed without a weight'), {
          description: t('The courier is quoted on the packed weight. Without it we estimate, and the difference comes out of your payment.'),
          action: productId
            ? undefined
            : {
                label: t('Add it'),
                onClick: () => router.push('/seller/products'),
              },
          duration: 8000,
        });
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
    <EditingContext.Provider value={Boolean(productId)}>
      <form onSubmit={submit} className="max-w-3xl space-y-5">
      {copyFromId && (
        <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
          Another size or colour of the same product. Everything is copied except the size, the stock
          and your item code. For a new colour: change the colour, swap the photos, keep the size. All of
          them are shown together on one page - colours as photos, sizes as buttons.
        </p>
      )}

      {/*
        BRING YOUR OWN LISTING (24 Sep 2026). A shop joining us already sells
        somewhere; retyping thirty listings is why a new seller signs up and
        never lists. Meesho and Glowroad both recruit with this button. One
        link at a time, the seller's own, and nothing is saved - it fills the
        form, the seller reads it and presses Save like any other listing.
      */}
      {!productId && !copyFromId && (
        <div className="rounded-xl border border-brand-ink/30 bg-brand-ink/5 p-4">
          <p className="text-sm font-medium">{t('Already selling this somewhere else?')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('Paste the link to your own listing on Meesho, Amazon, Flipkart or Instagram. The photos and the facts come across; you check them and save.')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Input
              value={importing.url}
              onChange={(e) => setImporting((i) => ({ ...i, url: e.target.value, error: '' }))}
              placeholder="https://www.meesho.com/…"
              className="h-10 min-w-56 flex-1"
              aria-label={t('Link to your listing')}
            />
            <Button
              type="button"
              disabled={importing.busy || !importing.url.trim()}
              onClick={async () => {
                setImporting((i) => ({ ...i, busy: true, error: '' }));
                try {
                  const r = await authedFetch('/seller/ai/import', {
                    method: 'POST',
                    body: { url: importing.url.trim(), categoryId: form.category || undefined },
                  });
                  const d = r.draft || {};
                  setForm((f) => ({
                    ...f,
                    name: d.name || f.name,
                    description: d.description || f.description,
                    price: d.price ?? f.price,
                    mrp: d.mrp ?? f.mrp,
                    color: d.color || f.color,
                    size: d.size || f.size,
                    material: d.material || f.material,
                    productType: d.productType || f.productType,
                    highlights: d.highlights?.length ? d.highlights : f.highlights,
                    attributes: { ...(f.attributes || {}), ...(d.attributes || {}) },
                  }));
                  if (d.images?.length) setPhotos((old) => [...old, ...d.images.map((src) => ({ src, kind: 'existing' }))].slice(0, 5));
                  setImporting({ url: '', busy: false, error: '' });
                  toast.success(t('Brought across - read it, fix the price, then save.'), {
                    description: t('{n} photos and the facts it could find. Nothing is saved yet.', { n: d.images?.length || 0 }),
                  });
                } catch (err) {
                  setImporting((i) => ({ ...i, busy: false, error: err.message }));
                }
              }}
            >
              {importing.busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {importing.busy ? t('Reading…') : t('Bring it in')}
            </Button>
          </div>
          {importing.error && <p className="mt-2 text-sm text-destructive">{importing.error}</p>}
          <p className="mt-2 text-[0.7rem] text-muted-foreground">
            {t('Only your own listings. The photos are copied to your shop, so they must be yours.')}
          </p>
        </div>
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

      {/*
        The rail: orientation and a jump, which is the honest half of what a
        stepper or tabs would have given - without hiding a section from the
        listing score or making an edit walk seven steps. See FormRail.jsx for
        the three references that decided it.
      */}
      <FormRail
        sections={[
          { id: 'photos', label: t('Photos'), done: photos.length > 0 },
          { id: 'words', label: t('Words'), done: Boolean(form.name && form.description) },
          { id: 'category-card', label: t('Category'), done: Boolean(form.category) },
          ...(template ? [{ id: 'facts-card', label: t('Facts'), done: Object.values(form.attributes || {}).some((v) => v && String(v).length) }] : []),
          { id: 'price-card', label: t('Price'), done: Boolean(form.price) && form.stock !== '' && form.stock !== undefined },
          { id: 'details', label: t('Details'), done: Boolean(form.color || form.size || form.material) },
          { id: 'faqs', label: t('Questions'), done: (form.faqs || []).some((x) => x.q && x.a) },
          { id: 'google', label: t('Google'), done: (form.tags || []).length > 0 },
        ]}
      />

      {/* 1. MEDIA */}
      <Card
        id="photos"
        req
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
          req
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
          req
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
        <Field id="category" req label="Where it sits in the shop" hint="Type to search. Shoppers browse by these, and Google reads them.">
          <CategoryPicker id="category" options={categories} value={form.category} onChange={setValue('category')} />
          <SuggestCategory parents={parents} />
        </Field>
      </Card>

      {/* 3b. THE CATEGORY'S FACTS (listing templates S2): what this kind of
          thing must say - dropdowns from the marketplaces' own facet values.
          The writer fills them from the photo; the seller corrects. */}
      <Card
        id="facts-card"
        title="4 · Product facts"
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
        title="5 · Price and stock"
        foldOnPhone
        summary={`${form.price ? `₹${form.price}` : t('No price')} · ${form.stock !== '' && form.stock !== undefined ? t('{n} in stock', { n: form.stock }) : t('stock?')}${form.weight ? ` · ${form.weight} g` : ''} · ${t({ R: 'return + refund', X: 'exchange only', N: 'no return' }[form.returnMode] || 'category return rule')}`}
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <Field id="price" req label="Selling price (₹)">
            <Input id="price" required inputMode="numeric" value={form.price} onChange={set('price')} className="h-10" />
          </Field>
          <Field
            id="mrp"
            label="MRP (₹)"
            hint="The price printed on the pack - legally the most it may be sold for, not a bigger number to flatter the discount."
          >
            <Input id="mrp" inputMode="numeric" value={form.mrp ?? ''} onChange={set('mrp')} className="h-10" />
          </Field>
          <Field id="stock" req label="How many">
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
        title="6 · Details"
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
        title="7 · Questions shoppers ask"
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
        title="8 · Google"
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

      {/* The question itself. Three answers, and the first one is the kind one:
          the draft road already exists, so nobody has to choose between
          "finish it now" and "lose it". */}
      <Dialog open={leaving !== null} onOpenChange={(open) => !open && setLeaving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Leave without saving?')}</DialogTitle>
            <DialogDescription>
              {t('What you have filled in is not saved yet. Keep it as a draft and finish it whenever you like - drafts are never on the site.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              disabled={state.status === 'saving'}
              onClick={async (e) => {
                await submit(e, true);
                setLeaving(null);
              }}
            >
              {state.status === 'saving' ? t('Saving…') : t('Save for later')}
            </Button>
            <Button type="button" variant="outline" onClick={leaveNow}>
              {t('Leave without saving')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setLeaving(null)}>
              {t('Keep editing')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <Button type="button" variant="outline" size="lg" disabled={state.status === 'saving'} onClick={(e) => submit(e, true)}>
          {t('Save for later')}
        </Button>
        <Button type="submit" disabled={state.status === 'saving'} size="lg">
          {state.status === 'saving' ? t('Saving…') : productId ? t('Save changes') : t('List it')}
        </Button>
        <Button type="button" onClick={() => (dirty ? setLeaving('cancel') : router.push('/seller/products'))} variant="ghost">
          Cancel
        </Button>
        {/*
          What the star means, said once and said honestly: the five marked
          fields are what LISTING needs, not what saving needs. "Save for
          later" writes a draft and the model asks for none of them
          (`notWhileDraft`), so promising otherwise here would be a lie the
          seller could catch in one click.
        */}
        <p className="basis-full text-xs text-muted-foreground sm:basis-auto">
          <span className="text-destructive">*</span> {t('needed to list · “Save for later” keeps a draft without them')}
        </p>
        <p aria-live="polite" className="text-sm">
          {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
        </p>
      </div>
      </form>
    </EditingContext.Provider>
  );
}
