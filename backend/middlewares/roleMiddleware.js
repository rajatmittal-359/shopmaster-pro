// backend/middlewares/roleMiddleware.js
const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // ✅ Flatten array if passed as single array argument
    const roles = allowedRoles.length === 1 && Array.isArray(allowedRoles[0])
      ? allowedRoles[0]
      : allowedRoles;

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'Access denied. Insufficient permissions.',
        requiredRoles: roles,
        yourRole: req.user.role,
      });
    }

    next();
  };
};

module.exports = roleMiddleware;
