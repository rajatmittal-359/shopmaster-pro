/**
 * Turning an error into an honest HTTP answer.
 *
 * THE PROBLEM THIS SOLVES
 *   errorMiddleware knew how to classify errors - a failed validation is the
 *   caller's 400, a bad id is a 400, a duplicate key is a 400 - but no
 *   controller ever called next(error), so none of that ever ran. Thirty
 *   handlers instead did:
 *
 *       catch (error) { res.status(500).json({ message: error.message }) }
 *
 *   So a seller who typed a two-letter product name got HTTP 500 and the raw
 *   sentence "Product validation failed: name: Product name must be at least 3
 *   characters, description: ...". Two things wrong with that. A 500 says the
 *   server broke when in fact the input was rejected - and 500s are what
 *   monitoring pages you about. And the message is Mongoose talking to a
 *   developer, not the shop talking to a seller.
 *
 *   The classification now lives here, so the middleware and the controllers
 *   cannot drift apart and disagree about what a given error means.
 */

/**
 * Decides the status and body an error deserves.
 *
 * @returns {{status: number, body: object}}
 */
const describeError = (err) => {
  // A unique index rejected the write. The caller can fix this by using a
  // different value, so it is their 400, not our 500.
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    return { status: 400, body: { message: `${field} already exists` } };
  }

  if (err && err.name === 'ValidationError') {
    // One line per field that was actually wrong. The single joined sentence
    // Mongoose produces is unusable in a form: it cannot be shown next to the
    // field it is about.
    const errors = Object.values(err.errors || {}).map((e) => e.message);
    return {
      status: 400,
      body: {
        message: errors[0] || 'Please check the details you entered',
        errors,
      },
    };
  }

  if (err && err.name === 'CastError') {
    return { status: 400, body: { message: 'Invalid ID format' } };
  }

  return {
    status: err?.statusCode || 500,
    body: { message: err?.message || 'Server Error' },
  };
};

/**
 * Replies with whatever the error deserves.
 *
 * For a controller's catch block, so a rejected input stops being reported as
 * a server failure.
 */
const sendError = (res, err) => {
  const { status, body } = describeError(err);
  if (status >= 500) console.error('Error:', err);
  return res.status(status).json(body);
};

module.exports = { describeError, sendError };
