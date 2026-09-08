'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authedFetch } from '@/lib/client';
import { getCategories } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

/**
 * Listing something for sale - the one thing every seller panel is built around
 * and the one thing ours could not do. The API has had `POST /seller/products`
 * all along; there was no screen.
 *
 * WHY COLOUR IS ON THIS FORM AND NOT OPTIONAL-LOOKING
 *   Google requires `color`, `gender` and `age_group` for free listings in
 *   category 166, which is where jewellery and accessories sit. A product
 *   created without a colour is not a smaller listing - it is one Merchant
 *   Center holds in "Under review", silently, until somebody goes looking.
 *   Seventeen of ours sat there.
 *
 * WHY THE CATEGORY LIST IS LEAVES ONLY
 *   The API refuses a parent category (validateLeafCategory), so offering one
 *   would be offering a choice that always fails. Products live on leaves.
 *
 * IMAGES ARE SENT AS BASE64
 *   Which is what the API accepts - it uploads to Cloudinary itself. Base64
 *   inflates a file by about a third, so the count is capped at five (the
 *   model's own limit) and the size is checked before anything is sent.
 */
const MAX_IMAGES = 5;
const MAX_FILE_MB = 5;

/** Depth-first, keeping only categories that have no children. */
const leavesOf = (categories, trail = []) =>
  categories.flatMap((cat) => {
    const path = [...trail, cat.name];
    const children = cat.children || [];
    return children.length === 0
      ? [{ _id: cat._id, label: path.join(' → ') }]
      : leavesOf(children, path);
  });

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

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
};

export default function ProductForm({ productId, copyFromId }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [images, setImages] = useState([]);
  const [categories, setCategories] = useState([]);
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const tree = await getCategories();
        if (cancelled) return;
        setCategories(leavesOf(tree));

        if (productId) {
          const data = await authedFetch(`/seller/products/${productId}`);
          const product = data.product || data;
          if (cancelled) return;
          setForm({
            ...EMPTY,
            ...product,
            // The API populates category; the form needs the id it will send.
            category: product.category?._id || product.category || '',
          });
        } else if (copyFromId) {
          /*
           * Adding another size of something that already exists.
           *
           * Everything about the style is copied - name, description, price,
           * photographs - and only what genuinely differs is cleared: the size
           * itself, the stock count, and the seller's own item code. Retyping
           * a description for each size is how the sizes end up describing
           * different products, which is exactly what item_group_id is meant
           * to prevent.
           */
          const data = await authedFetch(`/seller/products/${copyFromId}`);
          const source = data.product || data;
          if (cancelled) return;
          setForm({
            ...EMPTY,
            ...source,
            category: source.category?._id || source.category || '',
            size: '',
            stock: '',
            sku: '',
            // The group is the source's own, or the source itself if it is the
            // first of its kind. Either way both rows end up carrying it.
            variantGroupId: source.variantGroupId || String(source._id),
          });
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

  const addImages = async (e) => {
    const files = Array.from(e.target.files || []);
    const room = MAX_IMAGES - images.length - (form.images?.length || 0);

    if (files.length > room) {
      setState({ status: 'error', message: `Five photographs at most - room for ${room} more.` });
      return;
    }

    const tooBig = files.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig) {
      // Said before the upload rather than after it fails. A phone photograph
      // is often 6-8 MB straight from the camera.
      setState({
        status: 'error',
        message: `${tooBig.name} is over ${MAX_FILE_MB}MB. Shrink it and try again.`,
      });
      return;
    }

    try {
      const encoded = await Promise.all(files.map(readAsDataUrl));
      setImages([...images, ...encoded]);
      setState({ status: 'idle' });
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'saving' });

    // Numbers as numbers. Sending "499" as a string works today because
    // Mongoose casts it, and stops working the day a validator compares it.
    const body = {
      ...form,
      price: Number(form.price),
      mrp: form.mrp === '' ? undefined : Number(form.mrp),
      stock: Number(form.stock),
      lowStockThreshold: Number(form.lowStockThreshold) || 10,
      weight: form.weight === '' ? undefined : Number(form.weight),
      size: form.size || undefined,
      variantGroupId: form.variantGroupId || undefined,
      ...(images.length ? { images } : {}),
    };

    try {
      if (productId) {
        await authedFetch(`/seller/products/${productId}`, { method: 'PATCH', body });
      } else {
        await authedFetch('/seller/products', { method: 'POST', body });

        /*
         * The first product of a style does not know it is part of a group
         * until a second size exists. So when a copy is saved, the original is
         * given the same group id - otherwise the feed carries an
         * item_group_id on one row only, which tells Google there are siblings
         * it will never find.
         */
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
      // The server's own words - "Selling price cannot be above the MRP" is
      // something a seller can fix in ten seconds.
      setState({ status: 'error', message: err.message });
    }
  };

  if (state.status === 'loading') return <p className="text-muted-foreground">Loading…</p>;

  const field =
    'mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const label = 'text-sm font-medium';

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-6">
      {copyFromId && (
        <p className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Another size of an existing product. Everything is copied except the
          size, the stock and your item code - and both sizes are shown together
          on one page.
        </p>
      )}

      <section className="space-y-4 rounded-xl border border-border p-4">
        <div>
          <label htmlFor="name" className={label}>
            Name
          </label>
          <Input id="name" required value={form.name} onChange={set('name')} className="mt-1" />
          <p className="mt-1 text-xs text-muted-foreground">
            Write the colour into it if there is one - &ldquo;Rose Gold Pearl Ring&rdquo;.
            It is the first thing a shopper reads and the first thing Google
            matches.
          </p>
        </div>

        <div>
          <label htmlFor="description" className={label}>
            Description
          </label>
          <Textarea
            id="description"
            required
            rows={5}
            value={form.description}
            onChange={set('description')}
            className="mt-1"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Plain words. Markup is refused by the server - it is how one seller
            could otherwise run code in a shopper&rsquo;s browser.
          </p>
        </div>

        <div>
          <label htmlFor="category" className={label}>
            Category
          </label>
          <select
            id="category"
            required
            value={form.category}
            onChange={set('category')}
            className="mt-1"
          >
            <option value="">Choose one</option>
            {categories.map((cat) => (
              <option key={cat._id} value={cat._id}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border p-4">
        <h2 className="font-semibold">Price and stock</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="price" className={label}>
              Selling price (₹)
            </label>
            <Input
              id="price"
              required
              inputMode="numeric"
              value={form.price}
              onChange={set('price')}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="mrp" className={label}>
              MRP (₹)
            </label>
            <Input id="mrp" inputMode="numeric" value={form.mrp ?? ''} onChange={set('mrp')} className="mt-1" />
            <p className="mt-1 text-xs text-muted-foreground">
              The price printed on the pack. Legally the most it may be sold
              for - not a bigger number to make the discount look better.
            </p>
          </div>
          <div>
            <label htmlFor="stock" className={label}>
              How many
            </label>
            <Input
              id="stock"
              required
              inputMode="numeric"
              value={form.stock}
              onChange={set('stock')}
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="weight" className={label}>
              Parcel weight (kg)
            </label>
            <Input
              id="weight"
              inputMode="decimal"
              value={form.weight ?? ''}
              onChange={set('weight')}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The courier is quoted on this. Guessing low costs you the
              difference at the door.
            </p>
          </div>
          <div>
            <label htmlFor="lowStockThreshold" className={label}>
              Warn me at
            </label>
            <Input
              id="lowStockThreshold"
              inputMode="numeric"
              value={form.lowStockThreshold ?? 10}
              onChange={set('lowStockThreshold')}
              className="mt-1"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(form.freeShipping)} onChange={set('freeShipping')} />
              I pay the delivery
            </label>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border p-4">
        <h2 className="font-semibold">What Google needs</h2>
        <p className="text-sm text-muted-foreground">
          These three decide whether the product appears in Google Shopping for
          free. Leave the colour blank and it sits in &ldquo;Under review&rdquo; instead -
          which looks exactly like nothing happening.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="size" className={label}>
              Size
            </label>
            <Input
              id="size"
              value={form.size ?? ''}
              onChange={set('size')}
              placeholder="M"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Clothing and shoes only, and Google REQUIRES it for those - without
              it they are disapproved. Write what is on the label (&ldquo;M&rdquo;,
              &ldquo;38&rdquo;), never an internal code. Leave it empty for
              jewellery.
            </p>
          </div>

          <div>
            <label htmlFor="color" className={label}>
              Colour
            </label>
            <Input
              id="color"
              value={form.color ?? ''}
              onChange={set('color')}
              placeholder="Rose Gold"
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="gender" className={label}>
              Made for
            </label>
            <select id="gender" value={form.gender ?? 'female'} onChange={set('gender')} className="mt-1">
              <option value="female">Women</option>
              <option value="male">Men</option>
              <option value="unisex">Anyone</option>
            </select>
          </div>
          <div>
            <label htmlFor="ageGroup" className={label}>
              Age group
            </label>
            <select id="ageGroup" value={form.ageGroup ?? 'adult'} onChange={set('ageGroup')} className="mt-1">
              <option value="adult">Adult</option>
              <option value="kids">Kids</option>
              <option value="toddler">Toddler</option>
              <option value="infant">Infant</option>
              <option value="newborn">Newborn</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="brand" className={label}>
              Brand
            </label>
            <Input id="brand" value={form.brand ?? ''} onChange={set('brand')} className="mt-1" />
          </div>
          <div>
            <label htmlFor="sku" className={label}>
              Your own item code
            </label>
            <Input id="sku" value={form.sku ?? ''} onChange={set('sku')} className="mt-1" />
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="font-semibold">Photographs</h2>
        <p className="text-sm text-muted-foreground">
          Up to five. The first one is what shows in search and on the card, so
          make it the clearest. One photograph of the piece being WORN is worth
          more than three of it on a table - it is how a shopper judges the size.
        </p>

        <Input type="file" accept="image/*" multiple onChange={addImages} className="text-sm" />

        {(form.images?.length > 0 || images.length > 0) && (
          <p className="text-sm text-muted-foreground">
            {(form.images?.length || 0) + images.length} attached
            {form.images?.length > 0 && productId ? ' (existing ones are kept)' : ''}
          </p>
        )}
      </section>

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={state.status === 'saving'}>
          {state.status === 'saving' ? 'Saving…' : productId ? 'Save changes' : 'List it'}
        </Button>
        <Button
          type="button"
          onClick={() => router.push('/seller/products')} variant="ghost" size="sm">
          Cancel
        </Button>
      </div>

      <p aria-live="polite" className="min-h-5 text-sm">
        {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
      </p>
    </form>
  );
}
