const errorMiddleware = (err, req, res, next) => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(400).json({ 
      message: `${field} already exists` 
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ 
      message: 'Validation failed',
      errors: messages 
    });
  }

  // Mongoose CastError (invalid ID)
  if (err.name === 'CastError') {
    return res.status(400).json({ 
      message: 'Invalid ID format' 
    });
  }

  // Default error
  res.status(err.statusCode || 500).json({ 
    message: err.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorMiddleware;
