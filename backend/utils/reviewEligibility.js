const Order = require('../models/Order');

/**
 * The one question behind a review: did this customer actually receive this
 * product?
 *
 * Shared by createOrUpdateReview (the refusal) and myReviewStatus (the page's
 * flag), so the form the page offers and the answer the endpoint gives can
 * never disagree - the same discipline as canCancelOrder / customerMayDispute.
 *
 * The product is INSIDE the query, so it finds the order that contains it,
 * whichever of the customer's orders that is. `$elemMatch` makes "this
 * product" and "still active" apply to the same line - without it an order
 * holding this product cancelled plus some other live item would pass.
 * 'returned' counts: somebody who sent it back has still held it, and their
 * opinion is exactly the one a shopper wants.
 */
const deliveredOrderWith = (customerId, productId) =>
  Order.findOne({
    customerId,
    status: { $in: ['delivered', 'returned'] },
    items: { $elemMatch: { productId, status: 'active' } },
  });

module.exports = { deliveredOrderWith };
