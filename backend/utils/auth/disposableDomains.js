/**
 * Throwaway mail domains refused at sign-up (19 Sep 2026).
 *
 * Every marketplace blocks these: an account on a ten-minute inbox is a
 * fake COD order, a review farm or a coupon abuser waiting to happen, and
 * a public inbox (Mailinator's are readable by anyone) makes "reset your
 * password" a door for strangers. The list is the common ones, not the
 * world; a miss costs nothing but a fake account we catch later. Testing
 * uses Gmail "+" aliases, which are private and unlimited.
 */
const DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'sharklasers.com', 'grr.la', 'guerrillamailblock.com',
  '10minutemail.com', '10minutemail.net', '10minemail.com', 'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmailo.com', 'tempail.com',
  'yopmail.com', 'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf', 'nospam.ze.tc', 'nomail.xl.cx', 'mega.zik.dj', 'speed.1s.fr', 'courriel.fr.nf', 'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf',
  'dispostable.com', 'trashmail.com', 'trashmail.me', 'trashmail.net', 'trash-mail.com', 'mytrashmail.com', 'throwawaymail.com', 'throwam.com',
  'getnada.com', 'nada.email', 'mailnesia.com', 'maildrop.cc', 'mailcatch.com', 'mailsac.com', 'mohmal.com', 'fakeinbox.com', 'fakemail.net',
  'emailondeck.com', 'mintemail.com', 'mailtemp.net', 'tmpmail.org', 'tmpmail.net', 'tmail.ws', 'burnermail.io', 'inboxbear.com', 'spamgourmet.com',
  'mailexpire.com', 'anonbox.net', 'discard.email', 'spam4.me', 'harakirimail.com', 'mailforspam.com', 'crazymailing.com', 'einrot.com', 'armyspy.com', 'cuvox.de', 'dayrep.com', 'fleckens.hu', 'gustr.com', 'jourrapide.com', 'rhyta.com', 'superrito.com', 'teleworm.us',
  'emailfake.com', 'generator.email', 'tempr.email', 'luxusmail.org', 'mailpoof.com', 'moakt.com', 'tempinbox.com', 'mailtothis.com', 'dropmail.me', '1secmail.com', '1secmail.org', '1secmail.net', 'wwjmp.com', 'esiix.com', 'xojxe.com', 'yoggm.com',
]);

const isDisposable = (email) => {
  const at = String(email || '').toLowerCase().trim().lastIndexOf('@');
  if (at < 0) return false;
  const domain = String(email).toLowerCase().trim().slice(at + 1);
  if (DOMAINS.has(domain)) return true;
  // Sub-domains of a listed one (x.yopmail.com) count too.
  return [...DOMAINS].some((d) => domain.endsWith(`.${d}`));
};

module.exports = { isDisposable, DOMAINS };
