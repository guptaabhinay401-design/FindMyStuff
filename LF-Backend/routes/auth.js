const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

const PUBLIC_USER_FIELDS = "name email mobile collegeId profileImage role createdAt oauthProvider";
const PRIVATE_PASSWORD_FIELDS = "+password +passwordResetToken +passwordResetExpiresAt";

function normalizeOptionalText(value) {
    return String(value || "").trim();
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
        createdAt: user.createdAt || null,
        oauthProvider: user.oauthProvider || ""
    };
}

function signToken(user) {
    return jwt.sign(
        {
            id: String(user._id),
            email: user.email,
            role: user.role || "student"
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "7d"
        }
    );
}

function createAuthResponse(user, message) {
    return {
        message: message,
        token: signToken(user),
        user: sanitizeUser(user)
    };
}

function buildRandomPassword() {
    return crypto.randomBytes(24).toString("hex");
}

function createPasswordResetToken() {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

    return {
        rawToken: rawToken,
        tokenHash: tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 30)
    };
}

function getFrontendBaseUrl(req) {
    const configured = normalizeOptionalText(process.env.FRONTEND_BASE_URL);
    if (configured) {
        return configured.replace(/\/+$/, "");
    }

    const origin = normalizeOptionalText(req.get("origin"));
    if (origin && origin !== "null" && origin !== "undefined") {
        return origin.replace(/\/+$/, "");
    }

    const referer = normalizeOptionalText(req.get("referer"));
    if (referer && referer !== "null" && referer !== "undefined") {
        try {
            const parsed = new URL(referer);
            return parsed.origin.replace(/\/+$/, "");
        } catch (error) {
            // Ignore malformed referer and fall back to localhost.
        }
    }

    return "http://localhost:5500";
}

function createMailerTransport() {
    const host = normalizeOptionalText(process.env.SMTP_HOST);
    const port = Number.parseInt(process.env.SMTP_PORT || "", 10) || 587;
    const user = normalizeOptionalText(process.env.SMTP_USER);
    const pass = normalizeOptionalText(process.env.SMTP_PASS);

    if (host && user && pass) {
        return nodemailer.createTransport({
            host: host,
            port: port,
            secure: port === 465,
            auth: {
                user: user,
                pass: pass
            }
        });
    }

    return nodemailer.createTransport({
        jsonTransport: true
    });
}

async function sendResetPasswordEmail(req, email, resetUrl) {
    const transporter = createMailerTransport();
    const fromEmail = normalizeOptionalText(process.env.RESET_FROM_EMAIL) || "noreply@findmystuff.local";
    const info = await transporter.sendMail({
        from: fromEmail,
        to: email,
        subject: "FindMyStuff password reset",
        text: "Reset your password using this link: " + resetUrl,
        html: "<p>Reset your password using the link below:</p><p><a href=\"" + resetUrl + "\">" + resetUrl + "</a></p>"
    });

    return info;
}

async function verifyGoogleCredential(credential) {
    const response = await fetch(
        "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential)
    );

    if (!response.ok) {
        throw new Error("Invalid Google credential");
    }

    const payload = await response.json();
    const expectedAudience = normalizeOptionalText(process.env.GOOGLE_CLIENT_ID);

    if (expectedAudience && payload.aud !== expectedAudience) {
        throw new Error("Google client ID mismatch");
    }

    if (!payload.email || payload.email_verified !== "true") {
        throw new Error("Google account email is not verified");
    }

    return payload;
}

async function findUserForPasswordLogin(email) {
    return User.findOne({ email: email })
        .select(PUBLIC_USER_FIELDS + " " + PRIVATE_PASSWORD_FIELDS)
        .lean();
}

async function findCurrentUser(userId) {
    return User.findById(userId)
        .select(PUBLIC_USER_FIELDS)
        .lean();
}

router.get("/oauth/config", function (req, res) {
    res.json({
        googleClientId: normalizeOptionalText(process.env.GOOGLE_CLIENT_ID),
        googleSimulationEnabled: !normalizeOptionalText(process.env.GOOGLE_CLIENT_ID),
        appleSimulationEnabled: true
    });
});

router.post("/signup", async (req, res) => {
    try {
        const name = normalizeOptionalText(req.body.name);
        const email = normalizeOptionalText(req.body.email).toLowerCase();
        const mobile = normalizeOptionalText(req.body.mobile);
        const password = String(req.body.password || "");

        if (!name || !email || !mobile || !password) {
            return res.status(400).json({
                message: "Name, email, mobile and password are required"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters"
            });
        }

        const existingUser = await User.findOne({ email: email }).select("_id").lean();
        if (existingUser) {
            return res.status(400).json({
                message: "User already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({
            name: name,
            email: email,
            mobile: mobile,
            password: hashedPassword
        });

        res.status(201).json(createAuthResponse(newUser, "User registered successfully"));
    } catch (error) {
        res.status(500).json({
            message: "Could not register user"
        });
    }
});

router.post("/login", async (req, res) => {
    try {
        const email = normalizeOptionalText(req.body.email).toLowerCase();
        const password = String(req.body.password || "");

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        const user = await findUserForPasswordLogin(email);
        if (!user || !user.password) {
            return res.status(400).json({
                message: "Invalid credentials"
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({
                message: "Invalid credentials"
            });
        }

        res.json(createAuthResponse(user, "Login successful"));
    } catch (error) {
        res.status(500).json({
            message: "Could not login"
        });
    }
});

router.post("/forgot-password", async (req, res) => {
    try {
        const email = normalizeOptionalText(req.body.email).toLowerCase();
        if (!email) {
            return res.status(400).json({
                message: "Email is required"
            });
        }

        const user = await User.findOne({ email: email }).select("_id email");
        if (!user) {
            return res.json({
                message: "If the email exists, a reset link has been sent"
            });
        }

        const resetToken = createPasswordResetToken();
        user.passwordResetToken = resetToken.tokenHash;
        user.passwordResetExpiresAt = resetToken.expiresAt;
        await user.save({ validateBeforeSave: false });

        const resetUrl = getFrontendBaseUrl(req) + "/reset-password.html?token=" + resetToken.rawToken;
        const mailInfo = await sendResetPasswordEmail(req, user.email, resetUrl);

        const responseBody = {
            message: "If the email exists, a reset link has been sent"
        };

        if (!process.env.SMTP_HOST) {
            responseBody.resetUrl = resetUrl;
            responseBody.emailPreview = mailInfo.message || "";
        }

        res.json(responseBody);
    } catch (error) {
        res.status(500).json({
            message: "Could not start password reset"
        });
    }
});

router.post("/reset-password", async (req, res) => {
    try {
        const token = normalizeOptionalText(req.body.token);
        const newPassword = String(req.body.newPassword || "");

        if (!token || !newPassword) {
            return res.status(400).json({
                message: "Reset token and new password are required"
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                message: "New password must be at least 6 characters"
            });
        }

        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const user = await User.findOne({
            passwordResetToken: tokenHash,
            passwordResetExpiresAt: { $gt: new Date() }
        }).select(PUBLIC_USER_FIELDS + " " + PRIVATE_PASSWORD_FIELDS);

        if (!user) {
            return res.status(400).json({
                message: "Reset link is invalid or expired"
            });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.passwordResetToken = "";
        user.passwordResetExpiresAt = null;
        await user.save();

        res.json(createAuthResponse(user, "Password reset successful"));
    } catch (error) {
        res.status(500).json({
            message: "Could not reset password"
        });
    }
});

router.post("/oauth/google", async (req, res) => {
    try {
        const credential = normalizeOptionalText(req.body.credential);
        if (!credential) {
            return res.status(400).json({
                message: "Google credential is required"
            });
        }

        const googleUser = await verifyGoogleCredential(credential);
        const email = normalizeOptionalText(googleUser.email).toLowerCase();
        let user = await User.findOne({ email: email }).select(PUBLIC_USER_FIELDS);

        if (!user) {
            user = await User.create({
                name: normalizeOptionalText(googleUser.name) || email.split("@")[0],
                email: email,
                password: await bcrypt.hash(buildRandomPassword(), 10),
                oauthProvider: "google",
                oauthSubject: normalizeOptionalText(googleUser.sub)
            });
        }

        res.json(createAuthResponse(user, "Google login successful"));
    } catch (error) {
        res.status(400).json({
            message: error.message || "Google login failed"
        });
    }
});

router.post("/oauth/google/simulate", async (req, res) => {
    try {
        const email = normalizeOptionalText(req.body.email).toLowerCase();
        const name = normalizeOptionalText(req.body.name) || "Google User";

        if (!email) {
            return res.status(400).json({
                message: "Email is required for Google sign-in simulation"
            });
        }

        let user = await User.findOne({ email: email }).select(PUBLIC_USER_FIELDS);

        if (!user) {
            user = await User.create({
                name: name,
                email: email,
                password: await bcrypt.hash(buildRandomPassword(), 10),
                oauthProvider: "google",
                oauthSubject: normalizeOptionalText(req.body.subject) || crypto.randomUUID()
            });
        }

        res.json(createAuthResponse(user, "Google sign-in successful"));
    } catch (error) {
        res.status(500).json({
            message: "Google sign-in failed"
        });
    }
});

router.post("/oauth/apple/simulate", async (req, res) => {
    try {
        const email = normalizeOptionalText(req.body.email).toLowerCase();
        const name = normalizeOptionalText(req.body.name) || "Apple User";

        if (!email) {
            return res.status(400).json({
                message: "Email is required for Apple sign-in simulation"
            });
        }

        let user = await User.findOne({ email: email }).select(PUBLIC_USER_FIELDS);

        if (!user) {
            user = await User.create({
                name: name,
                email: email,
                password: await bcrypt.hash(buildRandomPassword(), 10),
                oauthProvider: "apple",
                oauthSubject: normalizeOptionalText(req.body.subject) || crypto.randomUUID()
            });
        }

        res.json(createAuthResponse(user, "Apple sign-in successful"));
    } catch (error) {
        res.status(500).json({
            message: "Apple sign-in failed"
        });
    }
});

router.get("/me", authMiddleware, async (req, res) => {
    try {
        const user = await findCurrentUser(req.user.id);
        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        res.json({
            user: sanitizeUser(user)
        });
    } catch (error) {
        res.status(500).json({
            message: "Could not load profile"
        });
    }
});

router.put("/profile", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select(PUBLIC_USER_FIELDS);
        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const nextEmail = normalizeOptionalText(req.body.email).toLowerCase();
        if (nextEmail && nextEmail !== user.email) {
            const existingUser = await User.findOne({ email: nextEmail }).select("_id").lean();
            if (existingUser && String(existingUser._id) !== String(user._id)) {
                return res.status(400).json({
                    message: "Email already in use"
                });
            }
            user.email = nextEmail;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
            user.name = normalizeOptionalText(req.body.name);
        }

        if (Object.prototype.hasOwnProperty.call(req.body, "mobile")) {
            user.mobile = normalizeOptionalText(req.body.mobile);
        }

        if (Object.prototype.hasOwnProperty.call(req.body, "collegeId")) {
            user.collegeId = normalizeOptionalText(req.body.collegeId);
        }

        if (Object.prototype.hasOwnProperty.call(req.body, "profileImage")) {
            user.profileImage = normalizeOptionalText(req.body.profileImage);
        }

        await user.save();

        res.json({
            message: "Profile updated successfully",
            user: sanitizeUser(user)
        });
    } catch (error) {
        res.status(500).json({
            message: "Could not update profile"
        });
    }
});

router.put("/change-password", authMiddleware, async (req, res) => {
    try {
        const currentPassword = String(req.body.currentPassword || "");
        const newPassword = String(req.body.newPassword || "");

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                message: "Current password and new password are required"
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                message: "New password must be at least 6 characters"
            });
        }

        const user = await User.findById(req.user.id).select(PUBLIC_USER_FIELDS + " " + PRIVATE_PASSWORD_FIELDS);
        if (!user || !user.password) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({
                message: "Current password is incorrect"
            });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.passwordResetToken = "";
        user.passwordResetExpiresAt = null;
        await user.save();

        res.json({
            message: "Password changed successfully"
        });
    } catch (error) {
        res.status(500).json({
            message: "Could not change password"
        });
    }
});

module.exports = router;
