'use client';

import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import PanelCard from '@/components/panel/PanelCard';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';

/**
 * The WhatsApp Business setup, filled in from the shop's own data.
 *
 * WHY (27 Sep 2026)
 *   Rajat set his mother's WhatsApp Business up on her phone at 1am and asked
 *   for the whole thing: "poora setup kar do catalog ka jisse mujhe dikkat na
 *   aae... site pe UI pe system". He is right that it belongs here and not in
 *   a chat message: the next seller will need the same six screens, and the
 *   shop already knows every answer.
 *
 * WHAT IT IS AND IS NOT
 *   WhatsApp's free Business app has no import and no API - every field is
 *   typed on a phone, by hand. Nothing here can press those buttons. What it
 *   CAN do is remove every chance to get one wrong: each field is generated
 *   from the seller's real data and copied with one tap, in the order the app
 *   asks for them.
 *
 *   The one that matters most is the LINK on each catalogue item. A shopper
 *   who taps it lands on the product page here, so the order carries an order
 *   record, a courier booking and returns cover - and it counts as a view on
 *   that listing's report. An order agreed inside a chat has none of that.
 *   This is also why there is no "sell on WhatsApp instead" anywhere on this
 *   page: Amazon, Flipkart and Meesho all keep seller chat off the buy path
 *   for the same reason, and a seller who takes the order in chat loses the
 *   protection the platform is for.
 */
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/*
 * WhatsApp shows a catalogue name on a phone, where a title written for
 * Google is cut off mid-word. The site keeps the long one; this trims to the
 * part a person reads, on a word boundary.
 */
const shortName = (name, max = 42) => {
  const n = String(name || '').trim();
  if (n.length <= max) return n;
  const cut = n.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ') > 20 ? cut.lastIndexOf(' ') : max).trim();
};

const copy = async (text, what = 'Copied') => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
  } catch {
    toast.error('Could not copy - select and copy it by hand');
  }
};

function CopyRow({ label, value, hint, multiline }) {
  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <button
          type="button"
          onClick={() => copy(value, `${label} copied`)}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-ink hover:underline"
        >
          <Copy className="size-3.5" aria-hidden /> copy
        </button>
      </div>
      <p className={`mt-1 rounded-lg bg-muted/50 p-2.5 text-sm ${multiline ? 'whitespace-pre-line' : 'break-all'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function WhatsAppKit({ data }) {
  const t = useT();
  const shop = data.businessName || 'our shop';
  const url = data.shopUrl;
  const items = data.catalogue || [];
  const phone = data.shop?.phone || '';
  const city = data.shop?.city || '';
  /*
   * "necklaces, earrings and rings", from the shop's own categories - a
   * generated profile that says "quality products at best price" is the
   * reason nobody reads generated profiles.
   */
  const sells = (data.shop?.sells || []).map((x) => String(x).toLowerCase());
  const sellsLine = sells.length
    ? `${sells.slice(0, -1).join(', ')}${sells.length > 1 ? ' and ' : ''}${sells[sells.length - 1]}`
    : '';

  // wa.me wants the number with the country code and nothing else in it.
  const digits = String(phone).replace(/\D/g, '');
  const waNumber = digits.length === 10 ? `91${digits}` : digits;
  const waLink = waNumber ? `https://wa.me/${waNumber}` : '';

  const description =
    `${shop}${city ? ` — ${city}` : ''}. ${sellsLine ? `${sellsLine[0].toUpperCase()}${sellsLine.slice(1)}. ` : ''}` +
    `See everything and order here: ${url}\n\n` +
    `Message us for photos, sizes or a custom order. Cash on delivery available, delivery across India. Returns as stated on each product.`;

  const greeting =
    `Namaste! ${shop} me aapka swagat hai 🙏\n` +
    `Humara poora collection yahan hai: ${url}\n` +
    `Photo, size ya price - kuch bhi poochhiye, hum jaldi jawab denge.`;

  const away =
    `Namaste! Abhi hum reply nahi kar pa rahe. Aapka message padh kar subah jawab denge 🙏\n` +
    `Tab tak poora collection dekhiye: ${url}`;

  return (
    <div className="space-y-6">
      <PanelCard
        title={t('WhatsApp Business, filled in for you')}
        lead={t('WhatsApp has no import - every field is typed on the phone. These are already written from your shop, so nothing has to be remembered or retyped.')}
      >
        <div className="divide-y">
          <CopyRow
            label={t('Business description')}
            value={description}
            multiline
            hint={t('Settings → Business tools → Business profile → Description. WhatsApp allows 512 characters.')}
          />
          <CopyRow label={t('Website')} value={url} hint={t('The same profile screen. Your shop page, not the marketplace home - the person messaging you wants your things.')} />
          {city && <CopyRow label={t('Address / area')} value={city} hint={t('Use the same address as your Google Business Profile, exactly.')} />}
          <CopyRow
            label={t('Greeting message')}
            value={greeting}
            multiline
            hint={t('Business tools → Greeting message. Sent to anyone who writes for the first time, or after 14 days.')}
          />
          <CopyRow
            label={t('Away message')}
            value={away}
            multiline
            hint={t('Business tools → Away message → Outside business hours. A buyer at 1am should not meet silence.')}
          />
          {waLink && (
            <CopyRow
              label={t('Your chat link')}
              value={waLink}
              hint={t('Put this in your Instagram bio, your Google Business Profile and on your parcels - it opens a chat with you, no number to type. It is built from the phone on your pickup address; if WhatsApp is on a different number, change it in Settings first.')}
            />
          )}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {t('Category: choose the one your Google Business Profile uses, word for word. Business hours: set them, so WhatsApp can show "usually replies within…".')}
        </p>
      </PanelCard>

      <PanelCard
        title={t('Your catalogue, ready to type in')}
        lead={t('Business tools → Catalogue → Add new item. Use the same photos as on your product page. The link is the important one: it brings the order back here, where it is recorded, booked with the courier and covered by returns.')}
      >
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('Nothing to put in a catalogue yet - it lists your live products that have a photo and stock.')}
          </p>
        ) : (
          <>
            <ol className="divide-y">
              {items.map((p, i) => (
                <li key={p.url} className="py-3">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs font-medium text-muted-foreground">{i + 1}</span>
                    <span className="font-medium">{shortName(p.name)}</span>
                    <span className="text-sm text-muted-foreground">{rupees(p.price)}</span>
                    {p.sku && <span className="text-xs text-muted-foreground">· {t('code')} {p.sku}</span>}
                    {!p.sku && <span className="text-xs text-muted-foreground">· {t('no code yet')}</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => copy(shortName(p.name), t('Name copied'))}>
                      <Copy className="size-3.5" aria-hidden /> {t('Name')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => copy(String(p.price), t('Price copied'))}>
                      <Copy className="size-3.5" aria-hidden /> {t('Price')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => copy(p.url, t('Link copied'))}>
                      <Copy className="size-3.5" aria-hidden /> {t('Link')}
                    </Button>
                    <Button size="sm" variant="ghost" render={<a href={p.url} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
                      <ExternalLink className="size-3.5" aria-hidden /> {t('photos')}
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">
              {t('{n} items. Only live products with a photo and stock are here - a catalogue that offers something sold out costs more than a short one.', { n: items.length })}
            </p>
          </>
        )}
      </PanelCard>

      <PanelCard title={t('The five labels worth keeping')} lead={t('Business tools → Labels. This is the one WhatsApp feature sellers actually keep using - it turns the chat list into an order list.')}>
        <ul className="flex flex-wrap gap-2 text-sm">
          {['New order', 'Paid', 'Dispatched', 'Delivered', 'Problem'].map((l) => (
            <li key={l} className="rounded-full border px-3 py-1">{t(l)}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          {t('One warning: the free Business app is all you need. Do not sign up for the WhatsApp Business Platform (API) - that one charges per conversation.')}
        </p>
      </PanelCard>
    </div>
  );
}
