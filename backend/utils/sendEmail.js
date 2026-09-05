/**
 * Transactional email, sent through Brevo's REST API.
 *
 * WHY WE LEFT SENDGRID
 *   It stopped delivering. The key was valid and the sender domain was
 *   authenticated, but every send came back:
 *
 *     401 {"errors":[{"message":"Maximum credits exceeded"}]}
 *
 *   The free credits were used up, so nothing had been sent for some time and
 *   nobody could tell: a customer who never receives their OTP cannot report
 *   it, and the shop only finds out by looking. Brevo's free tier allows 300
 *   emails a day, which is well clear of what this shop sends.
 *
 * WHY REST AND NOT BREVO'S SDK
 *   The SDK would mean installing a package. Node has had `fetch` built in
 *   since v18 (this runs on v22), so calling the HTTP API directly needs no new
 *   dependency at all.
 *
 * The exported signature is unchanged from the SendGrid version, so every
 * caller - OTP, order confirmations, shipping notices, the low-stock cron -
 * keeps working untouched.
 *
 * API reference: https://developers.brevo.com/reference/sendtransacemail
 */
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/** Give up rather than let a stalled email hold a customer's request open. */
const TIMEOUT_MS = 10000;

/**
 * Read configuration on first use, not at module load.
 *
 * setApiKey() used to run while this file was being required. Anything that
 * pulled in a controller before dotenv.config() had run therefore handed the
 * provider an empty key and then silently sent nothing. server.js happens to
 * load dotenv first, but scripts and tests do not, so the failure was
 * invisible. Reading the environment lazily keeps that fixed.
 */
const config = () => {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL;

  if (!apiKey) throw new Error('BREVO_API_KEY is not set');
  if (!fromEmail) throw new Error('BREVO_FROM_EMAIL is not set');

  return {
    apiKey,
    fromEmail,
    fromName: process.env.BREVO_FROM_NAME || 'ShopMaster Pro',
  };
};

/**
 * Send one transactional email.
 *
 * @param {object}  args
 * @param {string}  args.to       recipient address
 * @param {string}  args.subject
 * @param {string} [args.text]    plain-text body
 * @param {string} [args.html]    HTML body
 * @throws when the message was not accepted, carrying Brevo's own reason
 */
const sendEmail = async ({ to, subject, text, html }) => {
  const { apiKey, fromEmail, fromName } = config();

  // Brevo requires htmlContent (or a template). Every caller here sends HTML,
  // but a text-only caller must not fail silently, so the text is wrapped.
  const htmlContent = html || `<p>${text || ''}</p>`;

  let response;
  try {
    response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: to }],
        subject,
        htmlContent,
        ...(text ? { textContent: text } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // Network failure or timeout - never reached the provider at all.
    throw new Error(`Email provider unreachable: ${err.message}`);
  }

  if (!response.ok) {
    // Carry the provider's own words. "Maximum credits exceeded" is exactly
    // the message that explains an outage, and losing it costs hours.
    const detail = await response.text().catch(() => '');
    throw new Error(`Email rejected (HTTP ${response.status}): ${detail}`);
  }

  console.log('Email sent:', to);
};

module.exports = sendEmail;
