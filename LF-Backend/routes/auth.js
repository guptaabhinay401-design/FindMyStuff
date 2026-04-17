const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const User = require("../models/User");
const OtpRecord = require("../models/OtpRecord");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

const PUBLIC_USER_FIELDS = "name email mobile collegeId profileImage role isVerified createdAt oauthProvider";
const PRIVATE_PASSWORD_FIELDS = "+password +passwordResetToken +passwordResetExpiresAt";

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;
const OTP_RATE_LIMIT_MS = 60 * 1000; // 1 OTP per minute per email

// ────────────────────────────────────────────
// UTILITIES
// ────────────────────────────────────────────

function normalizeText(value) {
    return String(value || "").trim();
}

function hashOtp(otp) {
    return crypto.createHash("sha256").update(String(otp)).digest("hex");
}

function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function sanitizeUser(user) {
    return {
        id: String(user._id),
        name: user.name || "",
        email: user.email || "",
        mobile: user.mobile || "",
        collegeId: user.collegeId || "",
        profileImage: user.profileImage || "",
        role: user.role || "student",
        isVerified: user.isVerified || false,
        isBlocked: user.isBlocked || false,
        blockedAt: user.blockedAt || null,
        createdAt: user.createdAt || null,
        oauthProvider: user.oauthProvider || ""
    };
}

function signToken(user) {
    return jwt.sign(
        { id: String(user._id), email: user.email, role: user.role || "student" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
}

function createAuthResponse(user, message) {
    return { message, token: signToken(user), user: sanitizeUser(user) };
}

function buildRandomPassword() {
    return crypto.randomBytes(24).toString("hex");
}

// ────────────────────────────────────────────
// MAILER
// ────────────────────────────────────────────

function createMailer() {
    const host = normalizeText(process.env.SMTP_HOST);
    const port = Number.parseInt(process.env.SMTP_PORT || "", 10) || 587;
    const user = normalizeText(process.env.SMTP_USER);
    const pass = normalizeText(process.env.SMTP_PASS);

    if (host && user && pass) {
        return nodemailer.createTransport({
            host, port,
            secure: port === 465,
            auth: { user, pass }
        });
    }
    // Fallback: log to console (dev mode)
    return nodemailer.createTransport({ jsonTransport: true });
}

async function sendOtpEmail(toEmail, otp, purpose) {
    const transporter = createMailer();
    const from = normalizeText(process.env.SMTP_USER) || "noreply@findmystuff.app";
    const subject = purpose === "signup"
        ? "FindMyStuff — Verify your email"
        : "FindMyStuff — Password reset OTP";

    const body = `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px;">
          <h2 style="color:#1e3a8a;margin-bottom:8px;">FindMyStuff</h2>
          <p style="color:#475569;font-size:15px;">
            ${purpose === "signup" ? "Thanks for signing up! Use the OTP below to verify your email." : "Use the OTP below to reset your password."}
          </p>
          <div style="text-align:center;margin:28px 0;">
            <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#1e3a8a;">${otp}</span>
          </div>
          <p style="color:#94a3b8;font-size:13px;">This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
          <p style="color:#cbd5e1;font-size:12px;">FindMyStuff — Lost &amp; Found Platform</p>
        </div>
    `;

    const info = await transporter.sendMail({
        from, to: toEmail, subject,
        html: body,
        text: `Your FindMyStuff OTP is: ${otp}. Valid for 10 minutes.`
    });

    return info;
}

// ────────────────────────────────────────────
// OTP HELPERS
// ────────────────────────────────────────────

async function createAndSendOtp(email, purpose) {
    // Rate limit: 1 OTP per minute
    const recent = await OtpRecord.findOne({ email, purpose })
        .select("createdAt")
        .lean();

    if (recent) {
        const elapsed = Date.now() - new Date(recent.createdAt).getTime();
        if (elapsed < OTP_RATE_LIMIT_MS) {
            const wait = Math.ceil((OTP_RATE_LIMIT_MS - elapsed) / 1000);
            throw new Error(`Please wait ${wait} seconds before requesting a new OTP.`);
        }
        // Delete old OTP before creating new one
        await OtpRecord.deleteMany({ email, purpose });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await OtpRecord.create({ email, otpHash, purpose, expiresAt });
    const mailInfo = await sendOtpEmail(email, otp, purpose);

    // Dev mode: return OTP in response if SMTP not configured
    const isDevMode = !normalizeText(process.env.SMTP_HOST);
    return { otp: isDevMode ? otp : null, mailInfo };
}

async function verifyOtp(email, otpInput, purpose) {
    const record = await OtpRecord.findOne({ email, purpose })
        .select("+otpHash attempts expiresAt")
        .lean();

    if (!record) {
        throw new Error("OTP not found or already used. Please request a new one.");
    }

    if (new Date() > new Date(record.expiresAt)) {
        await OtpRecord.deleteOne({ _id: record._id });
        throw new Error("OTP has expired. Please request a new one.");
    }

    if (record.attempts >= MAX_OTP_ATTEMPTS) {
        await OtpRecord.deleteOne({ _id: record._id });
        throw new Error("Too many incorrect attempts. Please request a new OTP.");
    }

    const inputHash = hashOtp(otpInput.trim());
    if (inputHash !== record.otpHash) {
        await OtpRecord.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
        const left = MAX_OTP_ATTEMPTS - record.attempts - 1;
        throw new Error(`Incorrect OTP. ${left} attempt${left !== 1 ? "s" : ""} remaining.`);
    }

    // OTP verified — delete it
    await OtpRecord.deleteOne({ _id: record._id });
    return true;
}

// ────────────────────────────────────────────
// GOOGLE OAUTH HELPER
// ────────────────────────────────────────────

async function verifyGoogleCredential(credential) {
    const response = await fetch(
        "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential)
    );
    if (!response.ok) throw new Error("Invalid Google credential");
    const payload = await response.json();
    const expectedAudience = normalizeText(process.env.GOOGLE_CLIENT_ID);
    if (expectedAudience && payload.aud !== expectedAudience) {
        throw new Error("Google client ID mismatch");
    }
    if (!payload.email || payload.email_verified !== "true") {
        throw new Error("Google account email is not verified");
    }
    return payload;
}

// ────────────────────────────────────────────
// ROUTES
// ────────────────────────────────────────────

// GET /api/auth/oauth/config
router.get("/oauth/config", function (req, res) {
    res.json({
        googleClientId: normalizeText(process.env.GOOGLE_CLIENT_ID),
        googleSimulationEnabled: !normalizeText(process.env.GOOGLE_CLIENT_ID)
    });
});

// ── STEP 1: Send OTP for signup ──────────────────────
// POST /api/auth/send-signup-otp
router.post("/send-signup-otp", async (req, res) => {
    try {
        const email = normalizeText(req.body.email).toLowerCase();
        const name = normalizeText(req.body.name);
        const password = String(req.body.password || "");

        if (!name || !email || !password) {
            return res.status(400).json({ message: "Name, email and password are required" });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: "Invalid email format" });
        }

        // Check duplicate
        const existing = await User.findOne({ email }).select("_id oauthProvider").lean();
        if (existing) {
            if (existing.oauthProvider === "google") {
                return res.status(400).json({
                    message: "This email is linked to a Google account. Please use Google Sign In."
                });
            }
            return res.status(400).json({
                message: "An account already exists with this email. Please log in instead."
            });
        }

        const { otp: devOtp } = await createAndSendOtp(email, "signup");

        const response = {
            message: "OTP sent to your email. Please enter it to complete registration."
        };
        if (devOtp) {
            response.devOtp = devOtp; // Only in dev mode (no SMTP)
            response.devNote = "SMTP not configured — OTP shown here for development only.";
        }

        res.json(response);
    } catch (error) {
        res.status(400).json({ message: error.message || "Could not send OTP" });
    }
});

// ── STEP 2: Verify OTP and create account ────────────
// POST /api/auth/verify-signup
router.post("/verify-signup", async (req, res) => {
    try {
        const email = normalizeText(req.body.email).toLowerCase();
        const name = normalizeText(req.body.name);
        const password = String(req.body.password || "");
        const mobile = normalizeText(req.body.mobile);
        const otp = normalizeText(req.body.otp);

        if (!email || !name || !password || !otp) {
            return res.status(400).json({ message: "All fields including OTP are required" });
        }

        // Double-check duplicate (race condition guard)
        const existing = await User.findOne({ email }).select("_id").lean();
        if (existing) {
            return res.status(400).json({
                message: "An account already exists with this email."
            });
        }

        await verifyOtp(email, otp, "signup");

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({
            name, email, mobile, password: hashedPassword, isVerified: true
        });

        res.status(201).json(createAuthResponse(newUser, "Account created successfully! Welcome to FindMyStuff."));
    } catch (error) {
        res.status(400).json({ message: error.message || "Could not create account" });
    }
});

// ── LOGIN ─────────────────────────────────────────────
// POST /api/auth/login
router.post("/login", async (req, res) => {
    try {
        const email = normalizeText(req.body.email).toLowerCase();
        const password = String(req.body.password || "");

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const user = await User.findOne({ email })
            .select(PUBLIC_USER_FIELDS + " " + PRIVATE_PASSWORD_FIELDS + " isBlocked blockedAt")
            .lean();

        if (!user || !user.password) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        if (user.oauthProvider === "google") {
            return res.status(400).json({
                message: "This account uses Google Sign In. Please use the Google button to log in."
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        if (user.isBlocked) {
            return res.status(403).json({
                message: "Your account has been blocked by an administrator. Please contact support.",
                isBlocked: true
            });
        }

        res.json(createAuthResponse(user, "Login successful"));
    } catch (error) {
        res.status(500).json({ message: "Could not login" });
    }
});

// ── FORGOT PASSWORD: SEND OTP ─────────────────────────
// POST /api/auth/send-reset-otp
router.post("/send-reset-otp", async (req, res) => {
    try {
        const email = normalizeText(req.body.email).toLowerCase();
        if (!email) return res.status(400).json({ message: "Email is required" });

        const user = await User.findOne({ email }).select("_id oauthProvider").lean();
        if (!user) {
            // Don't reveal if email exists (security)
            return res.json({ message: "If this email is registered, an OTP has been sent." });
        }
        if (user.oauthProvider === "google") {
            return res.status(400).json({
                message: "This account uses Google Sign In and has no password to reset."
            });
        }

        const { otp: devOtp } = await createAndSendOtp(email, "forgot");

        const response = { message: "If this email is registered, an OTP has been sent." };
        if (devOtp) {
            response.devOtp = devOtp;
            response.devNote = "SMTP not configured — OTP shown here for development only.";
        }

        res.json(response);
    } catch (error) {
        res.status(400).json({ message: error.message || "Could not send OTP" });
    }
});

// ── FORGOT PASSWORD: RESET WITH OTP ──────────────────
// POST /api/auth/reset-password-otp
router.post("/reset-password-otp", async (req, res) => {
    try {
        const email = normalizeText(req.body.email).toLowerCase();
        const otp = normalizeText(req.body.otp);
        const newPassword = String(req.body.newPassword || "");

        if (!email || !otp || !newPassword) {
            return res.status(400).json({ message: "Email, OTP, and new password are required" });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        await verifyOtp(email, otp, "forgot");

        const user = await User.findOne({ email }).select(PUBLIC_USER_FIELDS);
        if (!user) return res.status(404).json({ message: "User not found" });

        user.password = await bcrypt.hash(newPassword, 10);
        user.isVerified = true;
        await user.save();

        res.json(createAuthResponse(user, "Password reset successful. You are now logged in."));
    } catch (error) {
        res.status(400).json({ message: error.message || "Could not reset password" });
    }
});

// ── GOOGLE OAUTH ──────────────────────────────────────
// POST /api/auth/oauth/google
router.post("/oauth/google", async (req, res) => {
    try {
        const credential = normalizeText(req.body.credential);
        if (!credential) return res.status(400).json({ message: "Google credential is required" });

        const googleUser = await verifyGoogleCredential(credential);
        const email = normalizeText(googleUser.email).toLowerCase();

        let user = await User.findOne({ email }).select(PUBLIC_USER_FIELDS + " isBlocked blockedAt");

        if (user && user.isBlocked) {
            return res.status(403).json({
                message: "Your account has been blocked. Please contact support.",
                isBlocked: true
            });
        }

        if (!user) {
            user = await User.create({
                name: normalizeText(googleUser.name) || email.split("@")[0],
                email,
                password: await bcrypt.hash(buildRandomPassword(), 10),
                oauthProvider: "google",
                oauthSubject: normalizeText(googleUser.sub),
                profileImage: normalizeText(googleUser.picture),
                isVerified: true
            });
        } else if (!user.oauthProvider) {
            // Existing email-password user linking to Google
            user.oauthProvider = "google";
            user.isVerified = true;
            if (!user.profileImage && googleUser.picture) {
                user.profileImage = normalizeText(googleUser.picture);
            }
            await user.save();
        }

        res.json(createAuthResponse(user, "Google login successful"));
    } catch (error) {
        res.status(400).json({ message: error.message || "Google login failed" });
    }
});

// POST /api/auth/oauth/google/simulate (dev only)
router.post("/oauth/google/simulate", async (req, res) => {
    try {
        const email = normalizeText(req.body.email).toLowerCase();
        const name = normalizeText(req.body.name) || "Google User";
        if (!email) return res.status(400).json({ message: "Email is required" });

        let user = await User.findOne({ email }).select(PUBLIC_USER_FIELDS + " isBlocked blockedAt");

        if (user && user.isBlocked) {
            return res.status(403).json({
                message: "Your account has been blocked.",
                isBlocked: true
            });
        }

        if (!user) {
            user = await User.create({
                name, email,
                password: await bcrypt.hash(buildRandomPassword(), 10),
                oauthProvider: "google",
                oauthSubject: normalizeText(req.body.subject) || crypto.randomUUID(),
                isVerified: true
            });
        }

        res.json(createAuthResponse(user, "Google sign-in successful"));
    } catch (error) {
        res.status(500).json({ message: "Google sign-in failed" });
    }
});

// ── PROTECTED ROUTES ──────────────────────────────────

// GET /api/auth/me
router.get("/me", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select(PUBLIC_USER_FIELDS + " isBlocked blockedAt isVerified")
            .lean();
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json({ user: sanitizeUser(user) });
    } catch (error) {
        res.status(500).json({ message: "Could not load profile" });
    }
});

// PUT /api/auth/profile
router.put("/profile", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select(PUBLIC_USER_FIELDS);
        if (!user) return res.status(404).json({ message: "User not found" });

        if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
            user.name = normalizeText(req.body.name);
        }
        if (Object.prototype.hasOwnProperty.call(req.body, "mobile")) {
            user.mobile = normalizeText(req.body.mobile);
        }
        if (Object.prototype.hasOwnProperty.call(req.body, "collegeId")) {
            user.collegeId = normalizeText(req.body.collegeId);
        }
        if (Object.prototype.hasOwnProperty.call(req.body, "profileImage")) {
            user.profileImage = normalizeText(req.body.profileImage);
        }

        await user.save();
        res.json({ message: "Profile updated successfully", user: sanitizeUser(user) });
    } catch (error) {
        res.status(500).json({ message: "Could not update profile" });
    }
});

// GET /api/auth/my-activity
router.get("/my-activity", authMiddleware, async (req, res) => {
    try {
        const Item = require("../models/Item");
        const Claim = require("../models/Claim");
        const userId = req.user.id;

        const [lostItems, foundItems, claims] = await Promise.all([
            Item.find({ reportedBy: userId, type: "lost" })
                .sort({ createdAt: -1 }).limit(10)
                .select("itemName location date status createdAt imageThumb category").lean(),
            Item.find({ reportedBy: userId, type: "found" })
                .sort({ createdAt: -1 }).limit(10)
                .select("itemName location date status createdAt imageThumb category").lean(),
            Claim.find({ claimedBy: userId })
                .sort({ createdAt: -1 }).limit(10)
                .populate("itemId", "itemName type status location").lean()
        ]);

        const stats = {
            totalLost: await Item.countDocuments({ reportedBy: userId, type: "lost" }),
            totalFound: await Item.countDocuments({ reportedBy: userId, type: "found" }),
            totalClaims: await Claim.countDocuments({ claimedBy: userId }),
            returned: await Item.countDocuments({ reportedBy: userId, status: "resolved" })
        };

        res.json({ lostItems, foundItems, claims, stats });
    } catch (error) {
        res.status(500).json({ message: "Could not load activity" });
    }
});

// PUT /api/auth/change-password
router.put("/change-password", authMiddleware, async (req, res) => {
    try {
        const currentPassword = String(req.body.currentPassword || "");
        const newPassword = String(req.body.newPassword || "");

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: "Current and new password are required" });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: "New password must be at least 6 characters" });
        }

        const user = await User.findById(req.user.id)
            .select(PUBLIC_USER_FIELDS + " " + PRIVATE_PASSWORD_FIELDS);
        if (!user || !user.password) {
            return res.status(404).json({ message: "User not found" });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Current password is incorrect" });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.json({ message: "Password changed successfully" });
    } catch (error) {
        res.status(500).json({ message: "Could not change password" });
    }
});

module.exports = router;
