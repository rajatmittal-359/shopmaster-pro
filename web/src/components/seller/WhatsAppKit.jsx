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
 * WhatsApp's "Add item" form allows 150 characters for the name - Rajat's
 * screenshot of it settled a guess I had made at 42. Our titles fit, so the
 * name goes across whole: the same words the customer sees on the site and
 * the same words they searched for. Only a genuinely over-long one is cut,
 * and then on a word boundary.
 */
const NAME_MAX = 150;
const fitName = (name) => {
  const n = String(name || '').trim();
  if (n.length <= NAME_MAX) return n;
  const cut = n.slice(0, NAME_MAX);
  return cut.slice(0, cut.lastIndexOf(' ')).trim();
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

  /*
   * The five questions every jewellery shop answers all day. Each one points
   * back at the product page rather than stating a policy in the chat: the
   * page is the promise the customer was shown, and a rule typed from memory
   * at 1am is how a shop ends up owing something it never offered.
   */
  const quickReplies = [
    { code: 'collection', text: `Namaste! Humara poora collection yahan hai:
${url}` },
    { code: 'cod', text: `Ji haan, cash on delivery available hai. Order product page se kar sakte hain:
${url}` },
    { code: 'delivery', text: `Delivery pure India me hoti hai. Aapke pin code ka time product page par dikh jata hai:
${url}` },
    { code: 'return', text: `Return aur exchange ka niyam har product ke page par likha hai - wahi laagu hota hai:
${url}` },
    { code: 'custom', text: 'Ji, custom order ho jata hai. Bataiye kya chahiye - design, colour, size aur kab tak - hum daam aur time bata denge.' },
  ];

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
            hint={t('Tools → Profile → Description. WhatsApp allows 512 characters.')}
          />
          <CopyRow label={t('Website')} value={url} hint={t('Tools → Profile → Website. Your shop page, not the marketplace home - the person messaging you wants your things.')} />
          {city && <CopyRow label={t('Address / area')} value={city} hint={t('Tools → Profile → Address. Use the same words as your Google Business Profile, exactly.')} />}
          <CopyRow
            label={t('Greeting message')}
            value={greeting}
            multiline
            hint={t('Tools → Greeting message. Sent to anyone who writes for the first time, or after 14 days.')}
          />
          <CopyRow
            label={t('Away message')}
            value={away}
            multiline
            hint={t('Tools → Away message → Outside business hours. A buyer at 1am should not meet silence.')}
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
          {t('Also on Tools → Profile: the category (use the same words as your Google Business Profile) and your hours, so WhatsApp can show "usually replies within…".')}
        </p>
      </PanelCard>

      <PanelCard
        title={t('Your catalogue, ready to type in')}
        lead={t('Tools → Catalog → Add new item. Use the same photos as on your product page. The link is the important one: it brings the order back here, where it is recorded, booked with the courier and covered by returns.')}
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
                    <span className="font-medium">{fitName(p.name)}</span>
                    <span className="text-sm text-muted-foreground">
                      {rupees(p.price)}
                      {p.salePrice ? ` → ${rupees(p.salePrice)}` : ''}
                    </span>
                    {p.sku ? (
                      <span className="text-xs text-muted-foreground">· {t('code')} {p.sku}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">· {t('no code yet')}</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => copy(fitName(p.name), t('Name copied'))}>
                      <Copy className="size-3.5" aria-hidden /> {t('Name')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => copy(String(p.price), t('Price copied'))}>
                      <Copy className="size-3.5" aria-hidden /> {t('Price')}
                    </Button>
                    {p.salePrice && (
                      <Button size="sm" variant="outline" onClick={() => copy(String(p.salePrice), t('Sale price copied'))}>
                        <Copy className="size-3.5" aria-hidden /> {t('Sale price')}
                      </Button>
                    )}
                    {p.description && (
                      <Button size="sm" variant="outline" onClick={() => copy(p.description, t('Description copied'))}>
                        <Copy className="size-3.5" aria-hidden /> {t('Description')}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => copy(p.url, t('Link copied'))}>
                      <Copy className="size-3.5" aria-hidden /> {t('Link')}
                    </Button>
                    {p.sku && (
                      <Button size="sm" variant="outline" onClick={() => copy(p.sku, t('Item code copied'))}>
                        <Copy className="size-3.5" aria-hidden /> {t('Item code')}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" render={<a href={p.url} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
                      <ExternalLink className="size-3.5" aria-hidden /> {t('photos')}
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 space-y-1 text-xs text-muted-foreground">
              <p>
                {t('Country of Origin is REQUIRED on that form - choose')} <b>{items[0]?.origin || 'India'}</b>{t(' for all of these.')}
              </p>
              <p>{t('Price is the struck-out one and Sale Price is what you charge. Where only one number is shown above, leave Sale Price empty.')}</p>
              <p>{t('Item name allows 150 characters, so nothing above is cut. Description allows 5000 - the copy button gives you the first part of the one on your product page.')}</p>
              <p>{t('When something sells out, use "Hide this item" rather than deleting it - the photos and the link come straight back.')}</p>
              <p>
                {t('{n} items. Only live products with a photo and stock are here - a catalogue that offers something sold out costs more than a short one.', { n: items.length })}
              </p>
            </div>
          </>
        )}
      </PanelCard>

      <PanelCard
        title={t('Answers you will type a hundred times')}
        lead={t('Tools → Quick replies. Give each one a short code; then typing "/" and the code sends the whole message. This is the feature sellers actually keep using.')}
      >
        <div className="divide-y">
          {quickReplies.map((q) => (
            <div key={q.code} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">/{q.code}</code>
                <button
                  type="button"
                  onClick={() => copy(q.text, t('Copied'))}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-ink hover:underline"
                >
                  <Copy className="size-3.5" aria-hidden /> copy
                </button>
              </div>
              <p className="mt-1 whitespace-pre-line rounded-lg bg-muted/50 p-2.5 text-sm">{q.text}</p>
            </div>
          ))}
        </div>
      </PanelCard>

      <PanelCard title={t('The rest of the Tools menu, in one line each')}>
        <ul className="space-y-2 text-sm">
          <li>
            <b>{t('Lists')}</b> — {t('this replaced Labels. Make one per stage - New order, Paid, Dispatched, Delivered, Problem - and the chat list becomes an order list.')}
          </li>
          <li>
            <b>{t('Instagram & Facebook')}</b> — {t('worth connecting: the catalogue can then show on the Instagram profile too, for free.')}
          </li>
          <li>
            <b>{t('Advertise')}</b> — {t('costs money and needs a card. Not now - the free listings and Google are not full yet.')}
          </li>
          <li>
            <b>{t('Payments')}</b> — {t('leave it off. Money taken inside a chat has no order record, no courier booking and no returns cover; the product page handles all three.')}
          </li>
          <li>
            <b>{t('Meta One')}</b> — {t('a paid bundle. Skip it.')}
          </li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          {t('And the one real warning: the free Business app is all you need. Never sign up for the WhatsApp Business Platform (API) - that one charges per conversation.')}
        </p>
      </PanelCard>
    </div>
  );
}
