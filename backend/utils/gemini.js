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
const LITE_MODEL = process.env.GEMINI_LITE_MODEL || 'gemini-3.5-flash-lite';
/*
 * When flash says 429 it stays 429 for a while (a daily quota, not a blip).
 * Remember it for ten minutes and start on lite - saves a wasted call and a
 * red line in the gateway log per request (15 Sep 2026: 51 of 83).
 */
let flashQuotaUntil = 0;
const quotaOut = (m) => m === DEFAULT_MODEL && Date.now() < flashQuotaUntil;

const { GEMINI_MODELS: API } = require('./ai/endpoints');

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
/**
 * When Gemini cannot answer today, Pollinations' nano model can - if a key is
 * set. The schema Gemini would have enforced is written into the prompt
 * instead; the caller validates the JSON either way.
 */
const fallbackOr = async (failure, prompt, opts) => {
  if (!process.env.POLLINATIONS_API_KEY || opts.textModel === 'gemini') return failure;
  const { pollinationsText } = require('./ai/textFallback');
  const schemaNote = opts.responseSchema
    ? `

Answer with ONE JSON object only, matching this JSON schema exactly (no prose, no markdown):
${JSON.stringify(opts.responseSchema)}`
    : '';
  // The system instruction folds into the prompt for a model without one.
  const second = await pollinationsText((opts.system ? `${opts.system}

` : '') + prompt + schemaNote, {
    imageUrl: opts.imageUrl,
    imageDataUrl: opts.imageDataUrl,
    json: Boolean(opts.responseSchema),
    temperature: opts.temperature,
  });
  if (!second.ok) return { ...failure, reason: `${failure.reason}; fallback: ${second.reason}` };
  console.warn(`Gemini unavailable (${failure.reason.slice(0, 60)}) - answered by Pollinations ${second.model}`);
  return { ...second, fellBack: true };
};

const generate = async (prompt, opts = {}) => {
  // The caller may name the road. 'nano' goes straight to Pollinations;
  // 'gemini' never falls back; 'auto' (default) is Gemini with nano behind it.
  if (opts.textModel === 'nano') {
    return fallbackOr({ ok: false, reason: 'Pollinations nano was asked for and is not configured' }, prompt, opts);
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return fallbackOr({ ok: false, reason: 'GEMINI_API_KEY is not set' }, prompt, opts);
  }

  const wanted = opts.model || DEFAULT_MODEL;
  const model = quotaOut(wanted) && !opts.noLite ? LITE_MODEL : wanted;
  const attempts = opts.attempts ?? 4;

  /*
   * The picture goes INLINE as base64, not as a URL. Gemini will not fetch
   * arbitrary URLs, and inlining means what the model saw is exactly what we
   * fetched - no CDN variant, no redirect, no surprise.
   */
  const parts = [];
  if (opts.imageDataUrl) {
    // Already bytes in hand - a photo the seller has picked but not yet saved.
    const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(opts.imageDataUrl);
    if (!m) return { ok: false, reason: 'That is not an image' };
    parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
  } else if (opts.imageUrl) {
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
          // Google Search grounding when asked for (opts.grounded): the model
          // may search and cite; the free tier allows a modest daily number.
          ...(opts.grounded ? { tools: [{ google_search: {} }] } : {}),
          ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
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

      if (text) return { ok: true, text, model };

      /*
       * A 200 with no text is a refusal, usually a safety block. Retrying the
       * same prompt gets the same refusal, so it is reported rather than
       * hammered.
       */
      const why = data?.candidates?.[0]?.finishReason || 'no reason given';
      return { ok: false, reason: `Gemini returned nothing (${why})` };
    }

    const body = await response.text().catch(() => '');

    // A 429 is quota, not a blip: retrying the same model in 1.5 s only burns
    // the wait. Go straight to lite / the next provider.
    if (!RETRYABLE.has(response.status) || attempt === attempts || response.status === 429) {
      const failure = {
        ok: false,
        status: response.status,
        reason: `Gemini said ${response.status}: ${body.slice(0, 200)}`,
      };
      // Out of quota for the day is the one failure a second provider can
      // answer; a 400 is our prompt's fault and would fail there too.
      // Before leaving Google: flash-lite has its own free quota (15 Sep 2026:
      // flash 429 all day at "limit: 20", lite answered in 0.8 s) and takes the
      // same schema, image and system prompt - so it goes first, nano after.
      if (response.status === 429 && model === DEFAULT_MODEL) flashQuotaUntil = Date.now() + 10 * 60 * 1000;
      if (response.status === 429 && model !== LITE_MODEL && !opts.noLite) {
        const lite = await generate(prompt, { ...opts, model: LITE_MODEL, attempts: 2, noLite: true });
        if (lite.ok) return lite;
      }
      return response.status === 429 ? fallbackOr(failure, prompt, opts) : failure;
    }

    // 1.5s, 3s, 4.5s. Long enough for a load spike to pass, short enough that
    // a catalogue run still finishes.
    await sleep(attempt * 1500);
  }

  return { ok: false, reason: 'Gemini did not answer' };
};

/**
 * Ask Gemini for text while letting it call our functions on the way.
 *
 * The assistant's road. The model gets the declarations of a few
 * read-only tools (getOrder, myPayouts, searchKnowledge …); when it answers
 * with a functionCall part instead of text, the caller's `run(name, args)`
 * is invoked, its result goes back as a functionResponse, and the model
 * continues - up to `maxRounds` times, so a stuck model cannot loop.
 *
 * The model's own turn is echoed back whole (thought signatures included -
 * the current models refuse a tool reply without them). No fallback here:
 * the second provider has no function calling, so the caller decides what
 * to do with the prefetched context when this returns not-ok.
 *
 * @param {Array<{role:'user'|'model', parts:Array}>} contents
 * @param {object} opts  system, declarations, run(name,args)=>Promise<object>, model, maxRounds, temperature
 * @returns {Promise<{ok:true,text:string,model:string,calls:string[]}|{ok:false,reason:string,status?:number}>}
 */
const generateWithTools = async (contents, opts = {}) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: 'GEMINI_API_KEY is not set' };
  const wanted = opts.model || DEFAULT_MODEL;
  const model = quotaOut(wanted) ? LITE_MODEL : wanted;
  const maxRounds = opts.maxRounds ?? 6;
  const calls = [];
  const thread = [...contents];

  for (let round = 0; round <= maxRounds; round += 1) {
    let response;
    let data;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        response = await fetch(`${API}/${model}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: thread,
            ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
            ...(opts.declarations?.length ? { tools: [{ functionDeclarations: opts.declarations }], toolConfig: { functionCallingConfig: { mode: 'AUTO' } } } : {}),
            generationConfig: { temperature: opts.temperature ?? 0.4, maxOutputTokens: opts.maxOutputTokens ?? 8192 },
          }),
        });
      } catch (networkErr) {
        if (attempt === 3) return { ok: false, reason: `Could not reach Gemini: ${networkErr.message}` };
        await sleep(attempt * 1500);
        continue;
      }
      if (response.ok) {
        data = await response.json().catch(() => null);
        break;
      }
      const body = await response.text().catch(() => '');
      if (!RETRYABLE.has(response.status) || response.status === 429 || attempt === 3) {
        return { ok: false, status: response.status, reason: `Gemini said ${response.status}: ${body.slice(0, 200)}` };
      }
      await sleep(attempt * 1500);
    }

    const content = data?.candidates?.[0]?.content;
    const parts = content?.parts || [];
    const fnCalls = parts.filter((p) => p.functionCall);
    if (!fnCalls.length) {
      const text = parts.map((p) => p.text || '').join('').trim();
      if (text) return { ok: true, text, model, calls };
      return { ok: false, reason: `Gemini returned nothing (${data?.candidates?.[0]?.finishReason || 'no reason given'})` };
    }
    if (round === maxRounds) return { ok: false, reason: 'Gemini kept asking for tools and never answered' };

    thread.push({ role: 'model', parts });
    const responses = [];
    for (const p of fnCalls) {
      const { name, args } = p.functionCall;
      calls.push(name);
      let result;
      try {
        result = await opts.run(name, args || {});
      } catch (err) {
        result = { error: err.message };
      }
      responses.push({ functionResponse: { name, response: result && typeof result === 'object' ? result : { result } } });
    }
    thread.push({ role: 'user', parts: responses });
  }
  return { ok: false, reason: 'Gemini did not answer' };
};

module.exports = { generate, generateWithTools, DEFAULT_MODEL };
