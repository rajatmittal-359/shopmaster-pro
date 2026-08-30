const sgMail = require('@sendgrid/mail');

/**
 * Configure SendGrid on first use, not at module load.
 *
 * setApiKey() used to run while this file was being required. Anything that
 * pulled in a controller before dotenv.config() had run therefore handed
 * SendGrid an empty key - it logged 'API key does not start with "SG."' to the
 * console and then silently sent nothing. server.js happens to load dotenv
 * first, but scripts and tests do not, so the failure was invisible.
 */
let configured = false;

const configure = () => {
  if (configured) return;

  const key = process.env.SENDGRID_API_KEY;
  if (!key) throw new Error('SENDGRID_API_KEY is not set');
  if (!process.env.SENDGRID_FROM_EMAIL) {
    throw new Error('SENDGRID_FROM_EMAIL is not set');
  }

  sgMail.setApiKey(key);
  configured = true;
};

const sendEmail = async ({ to, subject, text, html }) => {
  configure();

  try {
    await sgMail.send({
      to,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject,
      text,
      html,
    });

    console.log('Email sent:', to);
  } catch (error) {
    console.error('Error sending email:', error.message);
    throw error;
  }
};

module.exports = sendEmail;
