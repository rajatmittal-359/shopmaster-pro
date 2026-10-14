/**
 * India is the only timezone this business has, and the server is not in it.
 *
 * WHAT WENT WRONG (15 Oct 2026)
 *   Rajat, looking at a same-day quote: "borzo ka timing galat aata hai, am pm
 *   ka kuch pata nahi - raat ko agar same day delivery hai to am kaise aayega."
 *   It was not Borzo. The live container has no TZ set, so
 *   `Intl.DateTimeFormat().resolvedOptions().timeZone` resolves to 'UTC', and
 *   every `toLocaleString` written without a zone rendered 5h30m early: a real
 *   Borzo arrival of 04:02 am IST was printed to the customer as "10:32 pm".
 *   `toDateString()` comparisons were decided in UTC too, so between midnight
 *   and 05:30 IST "Today" and "Tomorrow" were a day out as well.
 *
 * WHY NOT JUST SET TZ ON THE CONTAINER
 *   Because that is the bigger, riskier half of the same fix. `TZ=Asia/Kolkata`
 *   would correct every unzoned format at once, but it also moves every day
 *   boundary in the app - cron firing times, "today" queries, working-day
 *   maths - and that is not a change to make while nobody is watching. It is
 *   written up in WHAT-IS-LEFT for Rajat to decide.
 *
 *   Naming the zone where the STRING is built is right whatever the box is set
 *   to, and is all this file does. Dates stay UTC in Mongo, as they should;
 *   only what a person reads is converted.
 */
const ZONE = 'Asia/Kolkata';

/** '04:02 am' - a clock time as Jaipur reads it. */
const istTime = (d) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: ZONE });

/** A date as Jaipur reads it; `opts` are the usual toLocaleDateString options. */
const istDate = (d, opts = { day: 'numeric', month: 'short' }) =>
  new Date(d).toLocaleDateString('en-IN', { ...opts, timeZone: ZONE });

/**
 * 'YYYY-MM-DD' in IST - the only safe way to ask "is this the same day?".
 *
 * en-CA is the locale whose short date IS the ISO order, so this needs no
 * padding or assembly of its own.
 */
const istDayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: ZONE });

module.exports = { ZONE, istTime, istDate, istDayKey };
