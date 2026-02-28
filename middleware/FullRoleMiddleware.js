 const jwt = require('jsonwebtoken');
 const User = require('../UserMangement/models/User');
 const Admin = require('../AdminMangement/models/Admin');
 
 const protect = async (req, res, next) => {
   try {
     let token = null;
     // 1Get token from cookie (primary)
     if (req.cookies && req.cookies.token) {
       token = req.cookies.token;
     }
     if (!token) {
       return res.status(401).json({
         success: false,
         message: 'Access denied. No token provided',
       });
     }
     // 3 Verify JWT (safe secret handling)
     const secret = process.env.JWT_SECRET;
     if (!secret) {
       console.error('JWT_SECRET is missing in env');
       return res.status(500).json({success: false,message: 'Server configuration error'});
     }
     const decoded = jwt.verify(token, secret);
     if (!decoded?.id) {
       return res.status(401).json({
         success: false,
         message: 'Invalid token payload',
       });
     }
     let currentUser = null;
     // 4️ Check Admin first (faster for admin panel routes)
     currentUser = await Admin.findById(decoded.id).lean();
     // 5️If not admin, check User collection
     if (!currentUser) {
       currentUser = await User.findById(decoded.id).lean();
     }
     if (!currentUser) {
       return res.status(401).json({
         success: false,
         message: 'User/Admin not found',
       });
     }
     // 6️ Blocked account check (both schemas support isBlocked)
     if (currentUser.isBlocked) {
       return res.status(403).json({
         success: false,
         message: 'Your account is blocked. Contact administrator.',
       });
     }
     if ('isActive' in currentUser && !currentUser.isActive) {
       return res.status(403).json({
         success: false,
         message: 'Account is deactivated',
       });
     }
     // 8️  Attach minimal safe user object to request (security best practice)
     req.user = {
       _id: currentUser._id,
       role: currentUser.role,
       email: currentUser.email,
       name: currentUser.name,
       isBlocked: currentUser.isBlocked,
     };
     next();
   } catch (error) {
     console.error('Auth Middleware Error:', error.message);
     // Token expired case
     if (error.name === 'TokenExpiredError') {
       return res.status(401).json({
         success: false,
         message: 'Session expired. Please login again.',
       });
     }
     // Invalid token case
     if (error.name === 'JsonWebTokenError') {
       return res.status(401).json({
         success: false,
         message: 'Invalid authentication token',
       });
     }
     return res.status(401).json({
       success: false,
       message: 'Authentication failed',
     });
   }
 };

 module.exports = protect;