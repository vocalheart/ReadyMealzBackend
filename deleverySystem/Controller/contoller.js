


const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const DeveleryController = require("../models/Auth.Schema");
const verifyUser = require('../middleware/PartnerMiddleware');

// ================= REGISTER API =================
router.post("/register",  async (req, res) => {
  try {
    const {fullName,phone,email,password,businessName,city,address,serviceTypes,status} = req.body;
    // Check required fields
    if (!fullName ||!phone ||!email ||!password ||!businessName ||!city ||!address) {
      return res.status(400).json({success: false,message: "All fields are required"});
    };
    // Check user already exists
    const existingUser = await DeveleryController.findOne({ email });
    if (existingUser) {return res.status(409).json({success: false, message: "User already exists"});}
    // Hash Password;
    const hashedPassword = await bcrypt.hash(password, 10);
    // Create new user
    const newUser = await DeveleryController.create({fullName, phone, email, password: hashedPassword, businessName, city,  address, serviceTypes, status});
    return res.status(201).json({success: true,message: "User registered successfully",data: newUser});
  } catch (error){
    console.log(error);
    return res.status(500).json({success: false,message: "Something went wrong",error: error.message});
  }
});

// ================= LOGIN API =================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    // Check fields
    if (!email || !password) {return res.status(400).json({success: false,message: "Email and password are required"});}
    // Find user
    const user = await DeveleryController.findOne({ email });
    if (!user) {return res.status(404).json({success: false, message: "User not found"})};
    // Compare password  
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {return res.status(401).json({success: false,message: "Invalid credentials"})}
    // Generate JWT Token
    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET,{ expiresIn: "7d" });
    // ================= SEND TOKEN IN COOKIE =================
    res.cookie("token", token, {
      httpOnly: true,                                         // Prevents JavaScript access (XSS protection)
      secure: true, // Use true in production (HTTPS)
      sameSite: "none",  // CSRF protection
      maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days in milliseconds
      path: "/"       // Available for whole site
    });
    // Send response (you can remove `token` from body if you want)
    return res.status(200).json({success: true,message: "Login successful",user: {id: user._id,email: user.email},
      token: token   // optional - remove for better security
    });
  } catch (error){
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message
    });
  }
});

// ================= VERIFY AUTH API =================
router.get("/me", verifyUser, async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: "User verified successfully",
      user: req.user,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
});

module.exports = router;




