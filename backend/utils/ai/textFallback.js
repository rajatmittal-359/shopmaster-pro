/**
 * The second road for text when Gemini's daily quota is gone.
 *
 * Pollinations serves gpt-5.4-nano on an OpenAI-compatible endpoint. It reads
 * a photo, answers in JSON mode, and costs about 0.0001 Pollen per call
 * (measured 12 Sep 2026: 0.40176 -> 0.40164 for one call with an image), so
 * the account's one-time Pollen is thousands of listing drafts. It is not the
 * first road: Gemini enforces a response schema server-side and writes the
 * better copy; this one is asked for JSON and the caller still validates.
 */
const ENDPOINT = 'https://gen.pollinations.ai/v1/chat/completions';
const MODEL = 'gpt-5.4-nano';

const pollinationsText = async (prompt, opts = {}) => {
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) return { ok: false, reason: 'POLLINATIONS_API_KEY is not set' };

  const content = [{ type: 'text', text: prompt }];
  const image = opts.imageDataUrl || opts.imageUrl;
  if (image) content.push({ type: 'image_url', image_url: { url: image } });

  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content }],
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 2048,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  } catch (err) {
    return { ok: false, reason: `Could not reach Pollinations: ${err.message}` };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return { ok: false, status: response.status, reason: `Pollinations said ${response.status}: ${body.slice(0, 200)}` };
  }
  const data = await response.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) return { ok: false, reason: 'Pollinations returned nothing' };
  return { ok: true, text, provider: 'pollinations', model: MODEL };
};

module.exports = { pollinationsText, MODEL };
