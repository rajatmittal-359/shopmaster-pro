/**
 * Where the AI calls go (plan 2.23 - Cloudflare AI Gateway).
 *
 * With CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_GATEWAY set, every Gemini and
 * Groq request is routed through the gateway - same providers, same keys,
 * same request bodies; Cloudflare only sits in the middle and keeps the
 * log (prompt, answer, latency, status, tokens) for the last 100k calls.
 * Without them, the direct provider URLs - tests and a laptop without the
 * account run exactly as before. The gateway is unauthenticated on
 * purpose: it proxies nothing without our provider key in the request.
 */
const acct = process.env.CLOUDFLARE_ACCOUNT_ID;
const gw = process.env.CLOUDFLARE_AI_GATEWAY;
const viaGateway = Boolean(acct && gw);
const base = viaGateway ? `https://gateway.ai.cloudflare.com/v1/${acct}/${gw}` : null;

module.exports = {
  viaGateway,
  /** `${GEMINI_MODELS}/${model}:generateContent?key=…` */
  GEMINI_MODELS: viaGateway ? `${base}/google-ai-studio/v1beta/models` : 'https://generativelanguage.googleapis.com/v1beta/models',
  /** `${GROQ_OPENAI}/chat/completions`, `${GROQ_OPENAI}/audio/transcriptions` */
  GROQ_OPENAI: viaGateway ? `${base}/groq` : 'https://api.groq.com/openai/v1',
};
