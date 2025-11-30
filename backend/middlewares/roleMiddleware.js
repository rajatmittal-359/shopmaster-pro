const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    // Check if user exists (set by authMiddleware)
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Check if user's role is allowed
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Access denied. Insufficient permissions.',
        requiredRoles: allowedRoles,
        yourRole: req.user.role
      });
    }

    next();
  };
};

module.exports = roleMiddleware;
