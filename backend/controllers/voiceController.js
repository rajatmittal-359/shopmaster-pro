const { transcribe } = require('../utils/ai/transcribe');
const { sendError } = require('../utils/apiError');

/**
 * POST /:role/voice/transcribe  and  POST /public/voice/transcribe
 *   body: { audio: "data:audio/webm;base64,...", language?: 'hi'|'hg'|'en'|'auto' }  (hg = Hinglish in roman letters)
 *   200:  { text, language, model, seconds }
 *
 * The public road exists for the search bar before sign-in; it sits behind
 * aiLimiter like every AI route, so a script cannot burn the day's minutes.
 * The clip is never stored - see utils/ai/transcribe.
 */
exports.transcribe = async (req, res) => {
  try {
    const audio = req.body?.audio;
    if (typeof audio !== 'string' || !audio.startsWith('data:audio/')) return res.status(400).json({ message: 'Send the recording as an audio data URL' });
    const language = ['hi', 'hg', 'en', 'auto'].includes(req.body?.language) ? req.body.language : 'auto';
    const r = await transcribe(audio, { language });
    if (!r.ok) return res.status(/too short|too long|not an audio/i.test(r.reason) ? 400 : 503).json({ message: r.reason });
    res.json({ text: r.text, language: r.language, model: r.model, seconds: r.seconds, fellBack: Boolean(r.fellBack) });
  } catch (error) {
    sendError(res, error);
  }
};
