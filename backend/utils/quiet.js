/**
 * A catch that still speaks (21 Sep 2026 audit of 51 silent catches).
 *
 * `.catch(() => {})` is right for fire-and-forget work whose failure must not
 * fail the request - a last-login stamp, a cache write, a security mail after
 * the change already happened. It is wrong when it also hides the failure
 * from the log: three of those were on the money and security paths. This is
 * the same shape with one line of evidence, so "it never sent" has a trace.
 *
 *   promise.catch(quiet('email-changed mail'))
 */
const quiet = (label) => (err) => {
  console.warn(`${label} failed (ignored): ${err && err.message ? err.message : err}`);
};

module.exports = { quiet };
