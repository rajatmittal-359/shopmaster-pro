/**
 * One-time: print a VAPID key pair for Web Push (plan 2.26).
 *   npm run vapid
 * Paste the three lines into backend/.env and into Render's Environment.
 * The subject is who the push service may contact about abuse - the admin mailbox.
 */
const { generateVAPIDKeys } = require('web-push');
const k = generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=mailto:rajatmittal359@gmail.com`);
