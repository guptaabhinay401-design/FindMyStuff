const express = require("express");
const router = express.Router();

const Item = require("../models/Item");
const authMiddleware = require("../middleware/authMiddleware");

const ITEM_LIST_FIELDS = "itemName category description type location date reporterName email imageThumb contactPublic possession createdAt status flagged flagReason";

function toSafeDate(value) {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

function sanitizeListItem(item, options) {
  const settings = Object.assign({
    allowLargeInlineImage: false,
    maxInlineImageLength: 1200000
  }, options || {});
  const nextItem = Object.assign({}, item);

  if (typeof nextItem.imageThumb === "string" && nextItem.imageThumb.trim()) {
    nextItem.image = nextItem.imageThumb.trim();
    return nextItem;
  }

  if (typeof nextItem.image !== "string") {
    nextItem.image = "";
  }

  if (
    !settings.allowLargeInlineImage
    && typeof nextItem.image === "string"
    && nextItem.image.startsWith("data:")
    && nextItem.image.length > settings.maxInlineImageLength
  ) {
    nextItem.image = "";
  }

  return nextItem;
}

// API: Get all found items
router.get("/", async (req, res) => {

  try {

    const items = await Item
      .find({ type: "found" })
      .sort({ date: -1 })
      .select(ITEM_LIST_FIELDS)
      .lean();

    res.json(items.map((item) => sanitizeListItem(item)));

  } catch (error) {

    res.status(500).json({
      message: "Server error"
    });

  }

});

// API: Create found item
router.post("/", authMiddleware, async (req, res) => {

  try {

    const {
      itemName,
      category,
      description,
      location,
      date,
      reporterName,
      phone,
      email,
      image,
      imageThumb,
      possession
    } = req.body;

    if (!itemName || !location) {
      return res.status(400).json({
        message: "itemName and location are required"
      });
    }

    const parsedPossession = typeof possession === "boolean" ? possession : null;

    const item = new Item({
      itemName: String(itemName).trim(),
      category: String(category || "Other").trim() || "Other",
      description: String(description || "").trim(),
      location: String(location).trim(),
      date: toSafeDate(date),
      reporterName: String(reporterName || "").trim(),
      phone: String(phone || "").trim(),
      email: String(email || "").trim(),
      image: String(image || "").trim(),
      imageThumb: String(imageThumb || "").trim(),
      possession: parsedPossession,
      reportedBy: req.user.id,
      type: "found"
    });

    const saved = await item.save();
    res.status(201).json({
      _id: saved._id,
      itemName: saved.itemName,
      category: saved.category,
      description: saved.description,
      type: saved.type,
      location: saved.location,
      date: saved.date,
      reporterName: saved.reporterName,
      phone: saved.phone,
      email: saved.email,
      image: saved.image,
      imageThumb: saved.imageThumb,
      contactPublic: saved.contactPublic,
      possession: saved.possession,
      createdAt: saved.createdAt,
      reportedBy: saved.reportedBy
    });

  } catch (error) {

    res.status(500).json({
      message: "Server error"
    });

  }

});

module.exports = router;
