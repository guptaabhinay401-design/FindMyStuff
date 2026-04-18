const mongoose = require("mongoose");

// Create schema for User collection
const UserSchema = new mongoose.Schema({

    // User full name
    name: {
        type: String,
        required: true
    },

    // User email (must be unique)
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address"]
    },

    // User password (will be stored as hashed password)
    password: {
        type: String,
        required: true,
        select: false
    },

    // User mobile number
    mobile: {
        type: String,
        default: ""
    },

    // Optional college identifier
    collegeId: {
        type: String,
        default: ""
    },

    // Optional profile image as URL or data URI
    profileImage: {
        type: String,
        default: ""
    },

    oauthProvider: {
        type: String,
        enum: ["", "google"],
        default: ""
    },

    oauthSubject: {
        type: String,
        default: ""
    },

    passwordResetToken: {
        type: String,
        default: "",
        select: false
    },

    passwordResetExpiresAt: {
        type: Date,
        default: null,
        select: false
    },

    // Role of user (student or admin)
    role: {
        type: String,
        default: "student"
    },

    isBlocked: {
        type: Boolean,
        default: false
    },

    blockedAt: {
        type: Date,
        default: null
    },

    // Whether the email has been verified via OTP
    isVerified: {
        type: Boolean,
        default: false
    },

    // User creation time
    createdAt: {
        type: Date,
        default: Date.now
    }

});

UserSchema.index({ createdAt: -1 });
UserSchema.index({ role: 1, createdAt: -1 });
UserSchema.index({ isBlocked: 1, createdAt: -1 });
UserSchema.index({ oauthProvider: 1, oauthSubject: 1 });

// Export model
module.exports = mongoose.model("User", UserSchema);
