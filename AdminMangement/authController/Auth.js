const express = require('express');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const router = express.Router();
const jwt = require('jsonwebtoken');

router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    // Check existing admin
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    // Hash password;
    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await Admin.create({
      name,
      email,
      password: hashedPassword,
      role: role || 'admin',
    });
    res.status(201).json({
      message: 'Admin created successfully',
      admin,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Block check
    if (admin.isBlocked) {
      return res.status(403).json({
        message: 'Your account is blocked by Super Admin',
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password' });
    };
    // JWT Token
    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET || 'SECRET_KEY',
      { expiresIn: '7d' }
    );
    res.json({
      message: 'Login successful',
      token,
      role: admin.role,
      id: admin._id,
      name:admin.name
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.put('/block/:id', async (req, res) => {
  try {
    const admin = await Admin.findByIdAndUpdate(
      req.params.id,
      { isBlocked: true },
      { new: true }
    );

    res.json({ message: 'Admin blocked successfully', admin });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/unblock/:id', async (req, res) => {
  try {
    const admin = await Admin.findByIdAndUpdate(
      req.params.id,
      { isBlocked: false },
      { new: true }
    );
    res.json({ message: 'Admin unblocked successfully', admin });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports= router