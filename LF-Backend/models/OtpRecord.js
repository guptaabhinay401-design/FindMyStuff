const mongoose = require("mongoose");

// Temporary OTP storage — auto-deleted via TTL index after expiry
const OtpRecordSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    // Stored as SHA-256 hash for security
    otpHash: {
        type: String,
        required: true,
        select: false
    },
    purpose: {
        type: String,
        enum: ["signup", "forgot"],
        required: true
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 } // MongoDB TTL: auto-delete when expiresAt passes
    },
    // Track failed attempts to prevent brute-force
    attempts: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

OtpRecordSchema.index({ email: 1, purpose: 1 });

module.exports = mongoose.model("OtpRecord", OtpRecordSchema);
