const mongoose = require("mongoose");

const DEFAULT_CATEGORIES = [
  "Wallet", "Mobile Phone", "Keys", "ID Card", "Bag",
  "Electronics", "Watch", "Laptop", "Headphones", "Other"
];

const DEFAULT_LOCATIONS = [
  "Library", "Cafeteria", "Hostel", "Parking Area",
  "Classroom", "Auditorium", "Lab", "Sports Ground", "Reception"
];

const AppSettingsSchema = new mongoose.Schema({
  // Singleton document — always _id = "global"
  _id: {
    type: String,
    default: "global"
  },

  categories: {
    type: [String],
    default: DEFAULT_CATEGORIES
  },

  locations: {
    type: [String],
    default: DEFAULT_LOCATIONS
  },

  toggles: {
    guestBrowsing: { type: Boolean, default: true },
    showContactInfo: { type: Boolean, default: true },
    newRegistrations: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: false }
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

AppSettingsSchema.statics.DEFAULT_CATEGORIES = DEFAULT_CATEGORIES;
AppSettingsSchema.statics.DEFAULT_LOCATIONS = DEFAULT_LOCATIONS;

// Helper: get the global settings doc (creates with defaults if missing)
AppSettingsSchema.statics.getGlobal = async function () {
  let doc = await this.findById("global");
  if (!doc) {
    doc = await this.create({ _id: "global" });
  }
  return doc;
};

module.exports = mongoose.model("AppSettings", AppSettingsSchema);
