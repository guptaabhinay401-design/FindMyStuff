const mongoose = require("mongoose");

// Schema for lost items
const lostItemSchema = new mongoose.Schema({

  itemName: {
    type: String,
    required: true
  },

  location: {
    type: String,
    required: true
  },

  description: {
    type: String
  },

  date: {
    type: Date,
    default: Date.now
  }

});

// Export model
module.exports = mongoose.model("LostItem", lostItemSchema);