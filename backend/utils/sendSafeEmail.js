// backend/utils/sendSafeEmail.js
const User = require('../models/User');
const sendEmail = require('./sendEmail');

const sendSafeEmail = async ({ toUserId, toEmail, subject, text, html }) => {
  try {
    let finalEmail = toEmail;

    if (!finalEmail && toUserId) {
      const user = await User.findById(toUserId).select('email');
      if (!user || !user.email) {
        console.warn('sendSafeEmail: user/email not found, skipping');
        return;
      }
      finalEmail = user.email;
    }

    if (!finalEmail) {
      console.warn('sendSafeEmail: no email provided, skipping');
      return;
    }

    await sendEmail({ to: finalEmail, subject, text, html });
  } catch (err) {
    console.error('sendSafeEmail error:', err.message);
  }
};

module.exports = sendSafeEmail;
