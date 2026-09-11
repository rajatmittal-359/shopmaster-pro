/**
 * The one place this project talks to Gemini.
 *
 * NO NEW DEPENDENCY. Node's built-in fetch, the same decision as the Brevo
 * move in utils/sendEmail.js - an SDK here would be one more thing to install,
 * pin and update for a single HTTP POST.
 *
 * WHY THE MODEL IS PINNED
 *   `gemini-2.5-flash` was in use once and disappeared mid-use; `-latest`
 *   aliases move under you by design, which is the same failure with a friendly
 *   name. A pinned model can be checked, and when it goes it goes loudly at a
 *   moment somebody is looking, rather than silently returning something
 *   different from what was tested.
 *
 * WHY THERE IS A RETRY
 *   Gemini answers 503 under load - observed on this account. A single 503 in
 *   the middle of a catalogue run would leave one product with the old
 *   duplicate text and no sign of which one, which is exactly the kind of
 *   partial failure that is worse than a total one.
 */

/**
 * Checked against the account's own model list on 7 September 2026, and then
 * against what that list will actually SERVE - which is not the same thing.
 *
 *   gemini-2.5-flash    listed, but generateContent answers 404. It really is
 *                       gone, exactly as the ops notes recorded.
 *   gemini-3.8-flash    works, and exhausted the free quota after four calls.
 *                       Newest is not free-est.
 *   gemini-3.5-flash    works, and has quota enough for a catalogue run.
 *
 * Override with GEMINI_MODEL when one of those facts changes, which it will.
 */
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Transient on Gemini's side: worth waiting for. Anything else is ours. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ask Gemini for text.
 *
 * Returns a reason rather than throwing, so a caller running over a whole
 * catalogue can record which product failed and carry on with the rest.
 *
 * @param {string} prompt
 * @param {object} [opts]
 * @param {string} [opts.model]
 * @param {number} [opts.attempts]      total tries, including the first
 * @param {number} [opts.temperature]
 * @param {string} [opts.imageUrl]      a picture for the model to look at,
 *                                      fetched here and sent inline
 * @param {object} [opts.responseSchema] ask for JSON in exactly this shape.
 *                                      Sets responseMimeType too, so the
 *                                      answer is parseable, not prose with
 *                                      JSON somewhere inside it
 * @returns {Promise<{ok: true, text: string}|{ok: false, reason: string, status?: number}>}
 */
const generate = async (prompt, opts = {}) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { ok: false, reason: 'GEMINI_API_KEY is not set' };
  }

  const model = opts.model || DEFAULT_MODEL;
  const attempts = opts.attempts ?? 4;

  /*
   * The picture goes INLINE as base64, not as a URL. Gemini will not fetch
   * arbitrary URLs, and inlining means what the model saw is exactly what we
   * fetched - no CDN variant, no redirect, no surprise.
   */
  const parts = [];
  if (opts.imageUrl) {
    try {
      const res = await fetch(opts.imageUrl);
      if (!res.ok) return { ok: false, reason: `Could not fetch the image (${res.status})` };
      const mimeType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
      const data = Buffer.from(await res.arrayBuffer()).toString('base64');
      parts.push({ inlineData: { mimeType, data } });
    } catch (err) {
      return { ok: false, reason: `Could not fetch the image: ${err.message}` };
    }
  }
  parts.push({ text: prompt });

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetch(`${API}/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            ...(opts.responseSchema
              ? { responseMimeType: 'application/json', responseSchema: opts.responseSchema }
              : {}),
            // Low, not zero. Fifty descriptions at temperature 0 come out in
            // the same shape as each other, which is the problem being fixed.
            temperature: opts.temperature ?? 0.7,
            /*
             * Generous on purpose. The current flash models THINK before they
             * answer and that reasoning is charged against this same budget -
             * at 2048 the first real product came back empty with
             * finishReason MAX_TOKENS, having spent the whole allowance before
             * writing a word. The caller wants 140 words; the headroom is for
             * everything the model does on the way there.
             */
            maxOutputTokens: opts.maxOutputTokens ?? 8192,
          },
        }),
      });
    } catch (networkErr) {
      if (attempt === attempts) {
        return { ok: false, reason: `Could not reach Gemini: ${networkErr.message}` };
      }
      await sleep(attempt * 1500);
      continue;
    }

    if (response.ok) {
      const data = await response.json().catch(() => null);
      const text = data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || '')
        .join('')
        .trim();

      if (text) return { ok: true, text };

      /*
       * A 200 with no text is a refusal, usually a safety block. Retrying the
       * same prompt gets the same refusal, so it is reported rather than
       * hammered.
       */
      const why = data?.candidates?.[0]?.finishReason || 'no reason given';
      return { ok: false, reason: `Gemini returned nothing (${why})` };
    }

    const body = await response.text().catch(() => '');

    if (!RETRYABLE.has(response.status) || attempt === attempts) {
      return {
        ok: false,
        status: response.status,
        reason: `Gemini said ${response.status}: ${body.slice(0, 200)}`,
      };
    }

    // 1.5s, 3s, 4.5s. Long enough for a load spike to pass, short enough that
    // a catalogue run still finishes.
    await sleep(attempt * 1500);
  }

  return { ok: false, reason: 'Gemini did not answer' };
};

module.exports = { generate, DEFAULT_MODEL };
