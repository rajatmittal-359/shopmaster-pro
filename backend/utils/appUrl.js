/**
 * Where the SITE lives, as opposed to this API.
 *
 * They are different origins in every environment this runs in, so anything
 * the backend puts in an email has to be built from configuration - a link
 * built from the incoming request would point at the API host and 404 in the
 * person's browser.
 *
 * The default is right for local work and wrong everywhere else, which is why
 * FRONTEND_URL is documented in .env.example and has to be set on Render.
 */
const frontendUrl = () =>
  (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

/** The page a customer follows their own order on. */
const orderUrl = (orderId) => `${frontendUrl()}/customer/orders/${orderId}`;

module.exports = { frontendUrl, orderUrl };
