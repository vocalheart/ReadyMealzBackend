const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    // Cookie se token lo (kyunki tum cookie use kar rahe ho)
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token, authorization denied',
      });
    }
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach user to req
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }
};

module.exports = authMiddleware;