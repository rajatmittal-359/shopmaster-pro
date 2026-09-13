/**
 * Sentry, held at arm's length.
 *
 * WHY THIS FILE EXISTS
 *   A 500 at checkout used to be invisible: Render's log scrolls past, nobody
 *   is watching on a Tuesday afternoon. Sentry (free Developer plan, 5k
 *   errors/month, no card) emails the admin the first time each new error
 *   happens, with the stack and the route.
 *
 * WHY IT IS OPTIONAL
 *   `@sentry/node` is required lazily and only when SENTRY_DSN is set, so the
 *   test suite, a laptop without the package, and a fresh clone all run with
 *   no change. If the package is missing in production the server still
 *   starts - it logs one line and goes on blind, which is what it was before.
 *
 * WHAT IS SENT, WHAT IS NOT
 *   The error, the route, the method, the user's id and role. Never request
 *   bodies, never headers (Authorization, Razorpay/Shiprocket webhook
 *   signatures), never the user's email - a marketplace's errors carry
 *   addresses and bank lines in their bodies and none of that belongs in a
 *   third party's database. Only 5xx: a 400 is the caller's, and paging on
 *   it is noise.
 */
let Sentry = null;

const init = () => {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || process.env.NODE_ENV === 'test') return false;
  try {
    // eslint-disable-next-line global-require
    Sentry = require('@sentry/node');
  } catch {
    console.warn('SENTRY_DSN is set but @sentry/node is not installed - run `npm install @sentry/node` in backend/. Running without error monitoring.');
    return false;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.RENDER_GIT_COMMIT || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // Nothing the SDK collected on its own about the request leaves here.
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.headers;
        delete event.request.cookies;
      }
      if (event.user) event.user = { id: event.user.id, role: event.user.role };
      return event;
    },
  });
  return true;
};

/**
 * Report one server-side failure with the request that caused it.
 * Safe to call always; a no-op when Sentry is off.
 */
const captureError = (err, req) => {
  if (!Sentry) return;
  Sentry.withScope((scope) => {
    if (req) {
      scope.setTag('route', `${req.method} ${req.baseUrl || ''}${req.route?.path || req.path || ''}`);
      scope.setContext('request', { method: req.method, url: req.originalUrl, ip: req.ip });
      if (req.user) scope.setUser({ id: String(req.user._id), role: req.user.role });
    }
    Sentry.captureException(err);
  });
};

/** For jobs and one-off scripts: name the job, send the error. */
const captureJobError = (job, err) => {
  if (!Sentry) return;
  Sentry.withScope((scope) => {
    scope.setTag('job', job);
    Sentry.captureException(err);
  });
};

const enabled = () => Boolean(Sentry);

module.exports = { init, captureError, captureJobError, enabled };
