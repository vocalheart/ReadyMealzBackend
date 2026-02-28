const adminRole = (...roles) => {
  return (req, res, next) => {
    try {
      if (!req.admin) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: Admin not authenticated',
        });
      }

      if (!roles.includes(req.admin.role)) {
        return res.status(403).json({
          success: false,
          message: `Access denied for role: ${req.admin.role}`,
        });
      }

      next();
    } catch (error) {
      console.error('Admin Role Error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Server error in role authorization',
      });
    }
  };
};

module.exports = adminRole;