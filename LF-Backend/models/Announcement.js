const mongoose = require("mongoose");

const AnnouncementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },

  message: {
    type: String,
    required: true,
    trim: true
  },

  // info | warning | urgent
  priority: {
    type: String,
    enum: ["info", "warning", "urgent"],
    default: "info"
  },

  sentBy: {
    type: String,
    default: "Admin",
    trim: true
  },

  // false = deleted/hidden from users
  active: {
    type: Boolean,
    default: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

AnnouncementSchema.index({ active: 1, createdAt: -1 });

module.exports = mongoose.model("Announcement", AnnouncementSchema);
