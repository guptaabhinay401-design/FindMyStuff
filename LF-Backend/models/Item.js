const mongoose = require("mongoose");

// Create schema for Lost and Found items
const ItemSchema = new mongoose.Schema({

    // Name of item
    itemName: {
        type: String,
        required: true
    },

    // Item description
    description: {
        type: String,
        default: ""
    },

    // Type of item (lost or found)
    type: {
        type: String,
        enum: ["lost", "found"],
        required: true
    },

    // Item category
    category: {
        type: String,
        default: "Other"
    },

    // Location where item was lost or found
    location: {
        type: String,
        required: true
    },

    // Date when item was lost/found
    date: {
        type: Date,
        default: Date.now
    },

    // Reporter details
    reporterName: {
        type: String,
        default: ""
    },
    phone: {
        type: String,
        default: ""
    },
    email: {
        type: String,
        default: ""
    },

    // Optional image (URL or data URI)
    image: {
        type: String,
        default: ""
    },

    imageThumb: {
        type: String,
        default: ""
    },

    status: {
        type: String,
        enum: ["active", "resolved", "rejected"],
        default: "active"
    },

    flagged: {
        type: Boolean,
        default: false
    },

    flagReason: {
        type: String,
        default: ""
    },

    // Contact preference for lost reports
    contactPublic: {
        type: Boolean,
        default: false
    },

    // Possession flag for found reports
    possession: {
        type: Boolean,
        default: null
    },

    // Reference to the user who reported the item
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    // Time when item was reported
    createdAt: {
        type: Date,
        default: Date.now
    }

});

ItemSchema.index({ type: 1, date: -1 });
ItemSchema.index({ type: 1, status: 1, date: -1 });
ItemSchema.index({ reportedBy: 1, createdAt: -1 });
ItemSchema.index({ category: 1, location: 1 });
ItemSchema.index({ flagged: 1, createdAt: -1 });

module.exports = mongoose.model("Item", ItemSchema);
