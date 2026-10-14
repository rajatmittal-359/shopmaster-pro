/**
 * Give every seller a point, once.
 *
 *   npm run locations           # see what it would do, change nothing
 *   npm run locations -- --write
 *
 * WHY A SCRIPT AND NOT A HOOK ON SAVE
 *   Geocoding is a network call to somebody else's free service, and a seller
 *   pressing Save must never wait on it or fail because of it. A seller's
 *   pickup address changes about never, so a script that can be re-run is the
 *   honest shape - the same choice the other backfill* files here made.
 *
 * WHAT IT WILL NOT DO
 *   It never overwrites a point that is already there - a seller who pasted
 *   their own Maps link knows better than a search engine. It writes nothing
 *   without --write. And a seller it cannot place is left alone rather than
 *   given a guess: utils/geo returns null, and null is a real answer.
 *
 * ITS MANNERS
 *   One request a second and a User-Agent that names us, which is what
 *   OpenStreetMap asks in return for charging nothing. The answers are cached
 *   in `geocodecaches`, so running this twice costs one round trip, not two.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const Seller = require('./models/Seller');
const { geocodeAddress, toPoint } = require('./utils/geo');

const WRITE = process.argv.includes('--write');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const sellers = await Seller.find({}).select('businessName pickupAddress').lean();

  let placed = 0;
  let already = 0;
  let unplaceable = 0;

  for (const s of sellers) {
    const a = s.pickupAddress || {};
    const name = s.businessName || String(s._id);

    if (a.location?.coordinates?.length === 2) {
      already += 1;
      console.log(`· ${name}: already placed`);
      continue;
    }
    if (!a.pincode && !a.city) {
      unplaceable += 1;
      console.log(`· ${name}: no city and no PIN - nothing to look up`);
      continue;
    }

    const point = await geocodeAddress(a);
    if (!point) {
      unplaceable += 1;
      console.log(`· ${name}: no match`);
      continue;
    }

    placed += 1;
    console.log(
      `${WRITE ? '✓' : '→'} ${name}: ${point.lat}, ${point.lng}  (${point.precision}${point.cached ? ', cached' : ''})`
    );
    if (WRITE) {
      await Seller.updateOne({ _id: s._id }, { $set: { 'pickupAddress.location': toPoint(point) } });
    }
  }

  console.log(
    `\n${WRITE ? 'Written' : 'Dry run'}: ${placed} placed, ${already} already had a point, ${unplaceable} left alone.`
  );
  if (!WRITE && placed) console.log('Run again with --write to save.');
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
