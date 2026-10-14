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
