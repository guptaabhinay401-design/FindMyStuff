const mongoose = require("mongoose");

const ClaimSchema = new mongoose.Schema({

  // Reference to the item being claimed
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item",
    required: true
  },

  // User who submitted the claim
  claimedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  // Claim message / proof description
  claimMessage: {
    type: String,
    required: true
  },

  // Optional extra proof description
  proofDescription: {
    type: String,
    default: ""
  },

  // Claimant contact details (may differ from profile)
  contactName: {
    type: String,
    default: ""
  },

  contactPhone: {
    type: String,
    default: ""
  },

  contactEmail: {
    type: String,
    default: ""
  },

  // Claim status
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },

  // Optional admin note / response
  adminNote: {
    type: String,
    default: ""
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }

});

// Update updatedAt before save
ClaimSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

ClaimSchema.index({ itemId: 1, status: 1 });
ClaimSchema.index({ claimedBy: 1, createdAt: -1 });
ClaimSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Claim", ClaimSchema);
