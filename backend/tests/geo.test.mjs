/**
 * Where a shop actually stands, and how to ask what is near it.
 *
 * WHY THIS EXISTS (15 Oct 2026)
 *   Everything about place in this app is a PIN code. `isLocalDelivery`
 *   compares the first three digits - the sorting district - which is a sound
 *   proxy for "same city" and is why same-day has worked without a map. What
 *   it cannot do is answer "which shops are near me", and that is the question
 *   a marketplace is eventually asked.
 *
 *   The research that led here is worth keeping so it is not repeated. Buying
 *   distance from Google was rejected: we pay them nothing today, and their
 *   own terms allow caching a geocode for only 30 days. A free PIN-to-latitude
 *   dataset was tried and FAILED the only test that mattered - the shop's own
 *   302019 was missing, and every Jaipur PIN in it shared one coordinate,
 *   90 km from Jaipur. A gate built on that would have been worse than the
 *   prefix it replaced.
 *
 *   So the point comes from the one party who always knows it: the seller.
 *   Pasting the Maps link of their own shop is the cheapest accurate answer,
 *   and these tests pin the shapes that link comes in.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { coordsFromMapsUrl, toPoint, nearQuery, haversineKm } = require('../utils/geo');

describe('reading a point out of a Maps link', () => {
  it('takes the @lat,lng the browser shows while you look at a place', () => {
    expect(coordsFromMapsUrl('https://www.google.com/maps/@26.9124,75.7873,17z')).toEqual({ lat: 26.9124, lng: 75.7873 });
  });

  it('prefers the pin in !3d!4d over the @ of the viewport', () => {
    // The @ is where the CAMERA is; !3d!4d is where the PLACE is. On a shared
    // place link they differ by a street, and the place is the one we want.
    const url = 'https://www.google.com/maps/place/Shop/@26.90,75.78,17z/data=!3m1!4b1!4m5!3m4!1s0x0:0x0!8m2!3d26.9124!4d75.7873';
    expect(coordsFromMapsUrl(url)).toEqual({ lat: 26.9124, lng: 75.7873 });
  });

  it('accepts the plain ?q= and ?ll= forms people paste from phones', () => {
    expect(coordsFromMapsUrl('https://maps.google.com/?q=26.9124,75.7873')).toEqual({ lat: 26.9124, lng: 75.7873 });
    expect(coordsFromMapsUrl('https://maps.google.com/?ll=26.9124,75.7873&z=16')).toEqual({ lat: 26.9124, lng: 75.7873 });
  });

  it('refuses a short link rather than guessing', () => {
    // share.google and maps.app.goo.gl carry no coordinates at all - they are
    // opened in a browser and redirect. Returning null says "open it and paste
    // the long one", which is true; inventing a point would not be.
    expect(coordsFromMapsUrl('https://share.google/GZeDQXL8I8PTvYkwd')).toBeNull();
    expect(coordsFromMapsUrl('https://maps.app.goo.gl/abc123')).toBeNull();
  });

  it('refuses nonsense and impossible coordinates', () => {
    expect(coordsFromMapsUrl('')).toBeNull();
    expect(coordsFromMapsUrl('https://example.com/shop')).toBeNull();
    expect(coordsFromMapsUrl('https://www.google.com/maps/@99.9,200.1,17z')).toBeNull();
  });
});

describe('the GeoJSON shape Mongo wants', () => {
  it('puts longitude first, which is the half everyone gets wrong', () => {
    expect(toPoint({ lat: 26.9124, lng: 75.7873 })).toEqual({ type: 'Point', coordinates: [75.7873, 26.9124] });
  });

  it('builds a $near query in metres, because $maxDistance is metres', () => {
    const q = nearQuery({ lat: 26.9124, lng: 75.7873 }, 15);
    expect(q.$near.$geometry).toEqual({ type: 'Point', coordinates: [75.7873, 26.9124] });
    expect(q.$near.$maxDistance).toBe(15000);
  });
});

describe('distance without a database', () => {
  // The same answer the index gives, for the places that only have two points
  // in hand - a quote, a test, a log line.
  it('measures Jaipur to Nasirabad at roughly 120 km', () => {
    const jaipur = { lat: 26.9124, lng: 75.7873 };
    const nasirabad = { lat: 26.3, lng: 74.73 };
    const km = haversineKm(jaipur, nasirabad);
    expect(km).toBeGreaterThan(100);
    expect(km).toBeLessThan(140);
  });

  it('is zero for a point against itself', () => {
    const p = { lat: 26.9124, lng: 75.7873 };
    expect(haversineKm(p, p)).toBe(0);
  });
});

/*
 * GEOCODING, WITHOUT GOOGLE (15 Oct 2026)
 *
 *   Google's Geocoding API needs billing switched on, and Google Cloud has
 *   refused Rajat's card - the same wall the image models hit. So the choice
 *   was never "Google or free", it was "free or nothing".
 *
 *   OpenStreetMap's Nominatim needs no key and no card. Tried against the real
 *   addresses first: the full line with the house number found NOTHING, the
 *   locality with the PIN found Devi Nagar at 26.8843/75.7620, and the bare
 *   PIN found 302019 at 26.8784/75.7580. That is the shape of the fix - ask
 *   narrow, then widen - and it is what these tests hold.
 *
 *   Their usage policy is the other half: one request a second, a User-Agent
 *   that says who we are, and no repeating a question already answered. The
 *   cache is therefore not an optimisation here, it is a condition of use -
 *   and unlike Google, nothing says we must forget the answer in 30 days.
 */
describe('geocoding an address', () => {
  const ADDR = { address1: 'C-13 Rajoriya House', address2: 'Hari Marg', city: 'Jaipur', state: 'Rajasthan', pincode: '302019' };
  const hit = (lat, lon, name) => [{ lat: String(lat), lon: String(lon), display_name: name }];

  it('widens the question until OSM answers, and says how precise the answer is', async () => {
    const { geocodeAddress } = require('../utils/geo');
    const asked = [];
    const fetchImpl = async (url) => {
      asked.push(decodeURIComponent(String(url)));
      // Exactly what the live service did: nothing for the house number,
      // an answer once the street is dropped.
      const body = asked.length === 1 ? [] : hit(26.8843, 75.7619, 'Devi Nagar, Jaipur, 302019');
      return { ok: true, json: async () => body };
    };
    const out = await geocodeAddress(ADDR, { fetchImpl, lookup: async () => null, save: async () => {} });
    expect(out).toMatchObject({ lat: 26.8843, lng: 75.7619, precision: 'locality', source: 'nominatim' });
    expect(asked.length).toBe(2);
    expect(asked[0]).toContain('C-13 Rajoriya House');
    expect(asked[1]).not.toContain('C-13');
  });

  it('never asks twice - a cached answer skips the network entirely', async () => {
    const { geocodeAddress } = require('../utils/geo');
    const fetchImpl = async () => { throw new Error('must not be called'); };
    const out = await geocodeAddress(ADDR, {
      fetchImpl,
      lookup: async () => ({ lat: 26.88, lng: 75.76, precision: 'pincode', source: 'nominatim' }),
      save: async () => {},
    });
    expect(out.lat).toBe(26.88);
    expect(out.cached).toBe(true);
  });

  it('identifies itself, as their policy requires', async () => {
    const { geocodeAddress } = require('../utils/geo');
    let headers;
    const fetchImpl = async (url, init) => {
      headers = init?.headers || {};
      return { ok: true, json: async () => hit(26.87, 75.75, '302019') };
    };
    await geocodeAddress({ pincode: '302019' }, { fetchImpl, lookup: async () => null, save: async () => {} });
    expect(String(headers['User-Agent'] || '')).toMatch(/ShopMaster/i);
  });

  it('returns null rather than a guess when nothing matches', async () => {
    const { geocodeAddress } = require('../utils/geo');
    const fetchImpl = async () => ({ ok: true, json: async () => [] });
    const out = await geocodeAddress(ADDR, { fetchImpl, lookup: async () => null, save: async () => {} });
    expect(out).toBeNull();
  });

  it('is silent when the service is down - an address simply has no point yet', async () => {
    const { geocodeAddress } = require('../utils/geo');
    const fetchImpl = async () => { throw new Error('network'); };
    const out = await geocodeAddress(ADDR, { fetchImpl, lookup: async () => null, save: async () => {} });
    expect(out).toBeNull();
  });
});
