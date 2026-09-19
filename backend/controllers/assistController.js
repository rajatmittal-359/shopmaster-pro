const AssistLog = require('../models/AssistLog');
const { ask } = require('../utils/ai/assistant');
const { sendError } = require('../utils/apiError');

/**
 * POST /:role/assist  - a question, an answer, a log line.
 * PATCH /assist/:id   - "was this helpful?"
 * GET  /admin/assist  - the last hundred questions, for the admin to read.
 *
 * The role comes from the route (each panel's router mounts its own), never
 * from the body - a customer cannot ask as the admin by saying so.
 */
const assistFor = (role) => async (req, res) => {
  try {
    const question = String(req.body?.question || '').trim();
    if (question.length < 2) return res.status(400).json({ message: 'Ask something' });
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-6) : [];
    const textModel = ['auto', 'gemini', 'nano'].includes(req.body?.textModel) ? req.body.textModel : 'auto';
    const language = ['hi', 'hg', 'en'].includes(req.body?.language) ? req.body.language : null;
    const r = await ask({ role, user: req.user, question, history, textModel, language });
    const log = await AssistLog.create({
      role,
      userId: req.user._id,
      question,
      language: r.ok ? r.language || language : language,
      answer: r.ok ? r.answer : '',
      model: r.ok ? r.model : null,
      searchedWeb: Boolean(r.ok && r.searchedWeb),
      calls: r.ok ? r.calls || [] : [],
      retrieved: r.ok ? r.retrieved || [] : [],
      ms: r.ok ? r.ms : 0,
      ok: r.ok,
    }).catch(() => null);
    if (!r.ok) return res.status(503).json({ message: `The assistant could not answer right now (${r.reason}). Try again in a minute, or ask a person from Help.` });
    res.json({ answer: r.answer, language: r.language, model: r.model, searchedWeb: r.searchedWeb, calls: r.calls || [], id: log?._id || null });
  } catch (error) {
    sendError(res, error);
  }
};

exports.seller = assistFor('seller');
exports.admin = assistFor('admin');
exports.customer = assistFor('customer');

exports.rate = async (req, res) => {
  try {
    const log = await AssistLog.findOne({ _id: req.params.id, userId: req.user._id });
    if (!log) return res.status(404).json({ message: 'Not found' });
    log.helpful = Boolean(req.body?.helpful);
    await log.save();
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
};

/** The weekly exam's last twelve runs (utils/ai/evals) - the quality trend on /admin/ask. */
exports.adminEvals = async (req, res) => {
  try {
    const EvalRun = require('../models/EvalRun');
    const runs = await EvalRun.find({}).sort({ at: -1 }).limit(12).lean();
    res.json({
      runs: runs.map((r) => ({ _id: r._id, at: r.at, cases: r.cases, clean: r.clean, byModel: r.byModel || {}, failing: (r.rows || []).filter((x) => x.problems && x.problems.length).map((x) => ({ role: x.role, language: x.language, question: x.question, model: x.model, problems: x.problems })) })),
    });
  } catch (error) {
    sendError(res, error);
  }
};

exports.adminLogs = async (req, res) => {
  try {
    const logs = await AssistLog.find({}).populate('userId', 'name email').sort({ createdAt: -1 }).limit(100).lean();
    res.json({ logs });
  } catch (error) {
    sendError(res, error);
  }
};
