const express = require("express");
const router = express.Router();

const Item = require("../models/Item");
const LostItem = require("../models/LostItem");
const authMiddleware = require("../middleware/authMiddleware");

const ITEM_LIST_FIELDS = "itemName category description type location date reporterName imageThumb contactPublic possession createdAt status flagged flagReason";

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

function normalizeLegacyLostItem(item) {
  return {
    _id: item._id,
    itemName: item.itemName,
    category: "Other",
    description: item.description || "",
    type: "lost",
    location: item.location,
    date: item.date || item.createdAt || new Date(),
    reporterName: "",
    phone: "",
    email: "",
    image: "",
    imageThumb: "",
    contactPublic: false,
    possession: null,
    createdAt: item.createdAt || item.date || new Date()
  };
}

function sortByDateDesc(items) {
  return items.sort((a, b) => {
    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();
    return bTime - aTime;
  });
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

// API: Get all lost items
router.get("/", async (req, res) => {

  try {

    const [typedItems, legacyItems] = await Promise.all([
      Item
        .find({ type: "lost" })
        .sort({ date: -1 })
        .select(ITEM_LIST_FIELDS)
        .lean(),
      LostItem.find().sort({ date: -1 }).lean()
    ]);
    const merged = typedItems
      .map((item) => sanitizeListItem(item))
      .concat(legacyItems.map(normalizeLegacyLostItem));

    res.json(sortByDateDesc(merged));

  } catch (error) {

    res.status(500).json({
      message: "Server error"
    });

  }

});

// API: Get latest lost items
router.get("/recent", async (req, res) => {

  try {

    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 10;

    const [typedItems, legacyItems] = await Promise.all([
      Item
        .find({ type: "lost" })
        .sort({ date: -1 })
        .limit(limit)
        .select(ITEM_LIST_FIELDS)
        .lean(),
      LostItem.find().sort({ date: -1 }).limit(limit).lean()
    ]);
    const merged = typedItems
      .map((item) => sanitizeListItem(item))
      .concat(legacyItems.map(normalizeLegacyLostItem));

    res.json(sortByDateDesc(merged).slice(0, limit));

  } catch (error) {

    res.status(500).json({
      message: "Server error"
    });

  }

});

// API: Create lost item
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
      contactPublic
    } = req.body;

    if (!itemName || !location) {
      return res.status(400).json({
        message: "itemName and location are required"
      });
    }

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
      contactPublic: Boolean(contactPublic),
      reportedBy: req.user.id,
      type: "lost"
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
