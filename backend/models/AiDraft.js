const mongoose = require('mongoose');

/**
 * A picture the AI made for an account, kept so it can be found again.
 *
 * The file itself lives on Cloudinary in the drafts folder. This is the index:
 * who made it, from which photo, with which model, so the product form can
 * show "your recent AI pictures" and the Studio can show today's strip after a
 * reload. Nothing here is a product image until the seller attaches it.
 */
const aiDraftSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    sourceUrl: { type: String, default: '' },
    mode: { type: String, default: '' },
    prompt: { type: String, default: '' },
    model: { type: String, default: '' },
    provider: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AiDraft', aiDraftSchema);
