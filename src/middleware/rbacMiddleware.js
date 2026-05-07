const Permissions = require('../models/permission');

// Check if the user has the required permission for a route
exports.checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userPermissions = new Permissions().getPermissionsByRoleName(req.user.role);

    if (userPermissions.includes(permission)) {
      return next();
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }
  };
};