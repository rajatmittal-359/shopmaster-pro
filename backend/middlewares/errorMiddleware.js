// backend/middlewares/errorMiddleware.js
//
// The last stop for anything a controller did not catch. It classifies with
// the same rules controllers use, so the two can never disagree about whether
// a given error is the caller's fault or ours. See utils/apiError.
const { describeError } = require('../utils/apiError');

// eslint-disable-next-line no-unused-vars -- Express needs all four to see this
const errorMiddleware = (err, req, res, next) => {
  const { status, body } = describeError(err);

  if (status >= 500) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }

  return res.status(status).json({
    ...body,
    ...(status >= 500 && process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorMiddleware;
