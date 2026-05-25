const jwt = require("jsonwebtoken");
const PartnerSchema = require("../models/Auth.Schema");

const verifyUser = async (req, res, next) => {
  try {
    let token = req.cookies?.token;

    // Authorization Header Check
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;

      if (authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      }
    }
    // Token Check
    if (!token) {
      return res.status(401).json({success: false,message: "Access denied. No token provided"});
    }
    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Find User From DB
    const user = await PartnerSchema.findById(decoded.id).select("-password");
    if (!user) {return res.status(404).json({success: false,message: "User not found",})}
    // Save user in request
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({success: false,message: "Invalid or expired token",error: error.message});
  }
};

module.exports = verifyUser;