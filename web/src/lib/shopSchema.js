/**
 * A shop, as structured data (29 Sep 2026).
 *
 * WHY IT LEFT THE COMPONENT
 *   This was built inline inside ShopView, which meant the one thing on the
 *   page a machine reads was the one thing no test could look at. It is a
 *   pure function of the API's answer, so it belongs where a test can reach
 *   it - the same move already made for the form rules (lib/validate) and the
 *   form sequence (lib/formSteps), and tested the same way, from the backend
 *   suite across the folder boundary.
 *
 * WHAT IT IS FOR
 *   Two different jobs, and they are worth keeping apart in the head:
 *
 *   1. `sameAs` joins this page to the shop's own profiles - its Google
 *      Business Profile, its Instagram. That is the claim "the website and
 *      that listing are one business".
 *   2. The postal address is what lets Google BELIEVE the claim. The match is
 *      made on street, locality and postcode agreeing between the site and
 *      the Profile, so the three are emitted as separate fields rather than
 *      as the one joined line the page prints for people.
 *
 * WHAT IS NOT HERE, DELIBERATELY
 *   Opening hours and a geo point, because the platform does not hold either
 *   yet - a seller has a pickup address, not a shopfront record. Inventing
 *   "10 to 7" for every shop would be worse than saying nothing: hours that
 *   are wrong send somebody to a closed door.
 */

/**
 * A link is only ever emitted if it is http(s).
 *
 * The API refuses anything else (sellerController parses each link with
 * `new URL` and matches the hostname), but `sameAs` is a public claim about
 * the shop and this is the last place the string is trusted, so it is checked
 * here too rather than depending on a validator three files away.
 */
export const safeHref = (raw) => {
  try {
    const u = new URL(String(raw));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
};

/**
 * The canonical address of a shop: its short link when it has one, the id URL
 * when it does not. Both routes render the same view, so without one
 * canonical Google would see two pages with identical content and pick for us.
 */
export const shopPath = (seller) => (seller?.slug ? `/${seller.slug}` : `/sellers/${seller?.id}`);

/**
 * Is this shop a PLACE, or only a shop on the internet?
 *
 * The gate is `showLocation` - which is what `city` being present means, the
 * API sends it only when the seller has switched their location on. A seller
 * who ships from a flat with the switch off is not a `Store`, and their
 * pickup address is a courier contact rather than a shopfront. A street line
 * is required too: a city on its own is not an address a search engine can
 * match against a Business Profile.
 */
export const isPlace = (seller) => Boolean(seller?.city && seller?.legal?.postal?.street);

export function buildShopSchema(seller, site) {
  const asPlace = isPlace(seller);
  const sameAs = Object.values(seller.links || {}).map(safeHref).filter(Boolean);

  return {
    '@context': 'https://schema.org',
    /*
     * Both types, because both are true: the shop is a place you can walk
     * into AND it sells online. schema.org allows the array and Google reads
     * it; picking one would have been a claim that the other is false.
     */
    '@type': asPlace ? ['Store', 'OnlineStore'] : 'OnlineStore',
    name: seller.businessName,
    url: `${site}${shopPath(seller)}`,
    ...(seller.about ? { description: seller.about } : {}),
    ...(seller.legal?.name && seller.legal.name !== seller.businessName ? { legalName: seller.legal.name } : {}),
    ...(seller.legal?.gstin ? { taxID: seller.legal.gstin } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(asPlace
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: seller.legal.postal.street,
            addressLocality: seller.legal.postal.locality || seller.city.city,
            addressRegion: seller.legal.postal.region || seller.city.state || undefined,
            postalCode: seller.legal.postal.postalCode || undefined,
            addressCountry: 'IN',
          },
          // A shop in Jaipur that also ships: both are true and both are said.
          areaServed: [
            { '@type': 'City', name: seller.city.city },
            { '@type': 'Country', name: 'India' },
          ],
        }
      : seller.city
        ? { address: { '@type': 'PostalAddress', addressLocality: seller.city.city, addressRegion: seller.city.state || undefined, addressCountry: 'IN' } }
        : {}),
    /*
     * The number the page already shows as a WhatsApp button, and only that
     * one - `whatsapp` is the field a seller typed into Settings knowing it
     * would be published. The pickup phone is a courier contact and the API
     * does not send it at all.
     */
    ...(seller.whatsapp ? { telephone: `+${String(seller.whatsapp).replace(/\D/g, '')}` } : {}),
    ...(seller.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: seller.rating.average, reviewCount: seller.rating.reviews } } : {}),
    parentOrganization: { '@type': 'Organization', name: 'ShopMaster Pro', url: site },
  };
}
