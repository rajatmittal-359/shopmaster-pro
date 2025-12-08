// backend/middlewares/roleMiddleware.js
const roleMiddleware = (allowedRoles) => {
  // Handle both array and single role
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

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
