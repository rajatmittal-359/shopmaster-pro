/**
 * What an account can DO, as opposed to what it is.
 *
 * THE BUG THIS FIXES
 *   `User.role` was a single enum, so an account was either a customer or a
 *   seller and never both. Two consequences, both real:
 *
 *     - Charming Jewels sells on this platform AND buys from it. With one role
 *       the shop's own account could not put anything in a cart: every
 *       /customer route answered 403.
 *     - A customer who wanted to start selling had to register again with a
 *       different email, and then had two accounts, two order histories and two
 *       passwords for one person.
 *
 * HOW IT WORKS NOW
 *   Buying is not a role at all - anybody signed in can buy. Selling is a
 *   CAPABILITY, and the record that grants it already existed: the Seller
 *   document, with its own isApproved and status. Admin stays a role, because
 *   it is one.
 *
 * WHY THE SELLER LOOKUP IS LAZY
 *   Reading the database on every request would put a query in front of every
 *   cart read and every order page for a fact those routes do not need. It is
 *   asked for only when a route actually requires selling - and skipped even
 *   then for an account whose `role` already says seller, because that field
 *   came from the database with the user.
 */
const mongoose = require('mongoose');

const Seller = require('../models/Seller');

/**
 * @param {object} user           the authenticated user document
 * @param {object} [options]
 * @param {boolean} [options.includeSeller]  look up the Seller record
 * @returns {Promise<{customer: boolean, seller: boolean, admin: boolean,
 *   sellerStatus: string|null, sellerApproved: boolean|null}>}
 */
const capabilitiesFor = async (user, { includeSeller = true } = {}) => {
  if (!user) {
    return {
      customer: false,
      seller: false,
      admin: false,
      sellerStatus: null,
      sellerApproved: false,
    };
  }

  const admin = user.role === 'admin';

  /*
   * An admin is not a shopper here, and letting the platform's own account buy
   * through it muddles every report that counts orders. Everyone else can buy:
   * that is the whole point of the change.
   */
  const customer = !admin;

  if (!includeSeller) {
    return { customer, seller: false, admin, sellerStatus: null, sellerApproved: null };
  }

  /*
   * The fast path. `role` is on the user document that authMiddleware loaded
   * from the database, so an established seller needs no second query - and
   * whether they may actually list or ship is decided downstream anyway, by
   * checkSellerStatus and requireApprovedSeller, which load the record
   * themselves.
   */
  if (user.role === 'seller') {
    return { customer, seller: true, admin, sellerStatus: null, sellerApproved: null };
  }

  /*
   * No database, no claim.
   *
   * Without this the query waits for a connection that is not coming and the
   * request hangs - which is what happened the moment this ran in the test
   * suite, where no test may reach a real database. Failing CLOSED is also the
   * right production answer: a capability we cannot verify is one we must not
   * grant, and every other route would be failing at that moment anyway.
   */
  if (mongoose.connection.readyState !== 1) {
    return { customer, seller: false, admin, sellerStatus: null, sellerApproved: null };
  }

  const sellerDoc = await Seller.findOne({ userId: user._id })
    .select('isApproved status')
    .lean();

  return {
    customer,
    /*
     * The DOCUMENT existing is the capability - it means "this account has
     * applied to sell". Approval and suspension are read downstream, in the
     * two middlewares that already own those rules. Duplicating them here
     * would be a second place for them to drift.
     */
    seller: Boolean(sellerDoc),
    admin,
    sellerStatus: sellerDoc?.status || null,
    sellerApproved: Boolean(sellerDoc?.isApproved),
  };
};

module.exports = { capabilitiesFor };
