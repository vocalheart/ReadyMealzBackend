const express = require('express');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const router = express.Router();

const User = require('../models/User');




const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  // Optional but recommended settings:
  tls: {
    rejectUnauthorized: false,      
  },
  pool: true,                 
  maxConnections: 5,
  maxMessages: 100,
});

// ── Professional OTP email HTML ──
const getOtpEmailHTML = (otp) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Password Reset OTP</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#333333;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:580px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f5c38 0%,#13ec5b 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                ReadyMealz<span style="color:#b9ffd3;">.in</span>
              </h1>
              <p style="margin:6px 0 0;font-size:12px;color:#d4f5e3;letter-spacing:1px;text-transform:uppercase;">
                Meals, Ready When You Are
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 28px;">

              <!-- Title -->
              <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0f2a1c;">
                Password Reset Request
              </h2>
              <p style="margin:0 0 24px;font-size:12px;color:#666666;line-height:1.7;">
                We received a request to reset the password for your <strong>ReadyMealz.in</strong> account.
                Use the OTP below to complete your password reset. This code is valid for
                <strong>10 minutes</strong>.
              </p>

              <!-- OTP Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;background:#f0faf4;border:2px dashed #13ec5b;border-radius:12px;padding:24px 48px;text-align:center;">
                      <p style="margin:0 0 4px;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1.5px;">
                        Your OTP Code
                      </p>
                      <p style="margin:0;font-size:36px;font-weight:800;color:#0f5c38;letter-spacing:10px;">
                        ${otp}
                      </p>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Steps -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fdf9;border-radius:8px;padding:20px;margin-bottom:28px;">
                <tr>
                  <td>
                    <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#0f2a1c;">
                      How to reset your password:
                    </p>
                    <table cellpadding="0" cellspacing="0">
                      ${['Go to the ReadyMealz.in password reset page',
                         'Enter your registered email address',
                         'Enter the OTP code shown above',
                         'Set your new password'].map((step, i) => `
                      <tr>
                        <td style="padding:4px 0;vertical-align:top;">
                          <span style="display:inline-block;width:20px;height:20px;background:#0f5c38;color:#fff;border-radius:50%;font-size:10px;font-weight:700;text-align:center;line-height:20px;margin-right:10px;">
                            ${i + 1}
                          </span>
                        </td>
                        <td style="padding:4px 0;font-size:12px;color:#444444;line-height:1.6;vertical-align:top;">
                          ${step}
                        </td>
                      </tr>`).join('')}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Warning -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f0;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:24px;">
                <tr>
                  <td>
                    <p style="margin:0;font-size:12px;color:#92400e;line-height:1.7;">
                      <strong>⚠️ Didn't request this?</strong><br/>
                      If you didn't request a password reset, please ignore this email.
                      Your account is safe and no changes have been made.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Security note -->
              <p style="margin:0;font-size:11px;color:#999999;line-height:1.7;">
                For your security, never share this OTP with anyone.
                ReadyMealz.in will <strong>never</strong> ask for your OTP via phone or chat.
              </p>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #eef2ef;margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;text-align:center;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#0f5c38;">
                ReadyMealz.in
              </p>
              <p style="margin:0 0 12px;font-size:11px;color:#999999;">
                Meals, Ready When You Are
              </p>
              <p style="margin:0;font-size:11px;color:#bbbbbb;line-height:1.7;">
                This is an automated email. Please do not reply to this message.<br/>
                © ${new Date().getFullYear()} ReadyMealz.in · All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
`;

// ══════════════════════════════════════
// FORGOT PASSWORD — SEND OTP
// POST /forgot-password
// ══════════════════════════════════════
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // ── Generate 6-digit OTP ──
    const otp       = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    user.resetPasswordOTP    = otp;
    user.resetPasswordExpire = otpExpire;
    await user.save();

    // ── Send professional email ──
    await transporter.sendMail({
      from:    `"ReadyMealz.in" <${process.env.EMAIL_USER}>`,
      to:      email,
      subject: 'Your Password Reset OTP — ReadyMealz.in',
      html:    getOtpEmailHTML(otp),
    });

    return res.status(200).json({ success: true, message: 'OTP sent successfully' });

  } catch (error) {
    console.error('FORGOT PASSWORD ERROR:', error);
    return res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});

// ══════════════════════════════════════
// RESET PASSWORD WITH OTP
// PUT /reset-password
// ══════════════════════════════════════
router.put('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const user = await User.findOne({
      email,
      resetPasswordOTP:    otp,
      resetPasswordExpire: { $gt: Date.now() },
    }).select('+password');

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    user.password            = await bcrypt.hash(newPassword, 10);
    user.resetPasswordOTP    = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    return res.status(200).json({ success: true, message: 'Password reset successful' });

  } catch (error) {
    console.error('RESET PASSWORD ERROR:', error);
    return res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});

module.exports = router;