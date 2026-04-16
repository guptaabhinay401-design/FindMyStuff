const express = require("express");
const router = express.Router();

const AppSettings = require("../models/AppSettings");
const Announcement = require("../models/Announcement");
const authMiddleware = require("../middleware/authMiddleware");

// ── Auth helpers ────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

function normalizeText(v) {
  return String(v || "").trim();
}

// ════════════════════════════════════════════════════════════
//  PUBLIC READ ENDPOINTS  (no auth needed)
// ════════════════════════════════════════════════════════════

// GET /api/settings/categories
router.get("/categories", async (req, res) => {
  try {
    const s = await AppSettings.getGlobal();
    res.json({ categories: s.categories });
  } catch (e) {
    res.status(500).json({ message: "Could not load categories" });
  }
});

// GET /api/settings/locations
router.get("/locations", async (req, res) => {
  try {
    const s = await AppSettings.getGlobal();
    res.json({ locations: s.locations });
  } catch (e) {
    res.status(500).json({ message: "Could not load locations" });
  }
});

// GET /api/settings/toggles
router.get("/toggles", async (req, res) => {
  try {
    const s = await AppSettings.getGlobal();
    res.json({ toggles: s.toggles });
  } catch (e) {
    res.status(500).json({ message: "Could not load toggles" });
  }
});

// GET /api/settings/announcements  — active announcements for all users
router.get("/announcements", async (req, res) => {
  try {
    const announcements = await Announcement.find({ active: true })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json({ announcements });
  } catch (e) {
    res.status(500).json({ message: "Could not load announcements" });
  }
});

// ════════════════════════════════════════════════════════════
//  ADMIN-ONLY WRITE ENDPOINTS  (auth + admin required)
// ════════════════════════════════════════════════════════════

// PUT /api/settings/categories   body: { categories: [...] }
router.put("/categories", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const raw = req.body.categories;
    if (!Array.isArray(raw)) {
      return res.status(400).json({ message: "categories must be an array" });
    }

    const categories = raw
      .map((c) => normalizeText(c))
      .filter(Boolean)
      .slice(0, 100); // max 100 categories

    await AppSettings.findByIdAndUpdate(
      "global",
      { categories, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    res.json({ message: "Categories updated", categories });
  } catch (e) {
    res.status(500).json({ message: "Could not update categories" });
  }
});

// PUT /api/settings/locations   body: { locations: [...] }
router.put("/locations", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const raw = req.body.locations;
    if (!Array.isArray(raw)) {
      return res.status(400).json({ message: "locations must be an array" });
    }

    const locations = raw
      .map((l) => normalizeText(l))
      .filter(Boolean)
      .slice(0, 100);

    await AppSettings.findByIdAndUpdate(
      "global",
      { locations, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    res.json({ message: "Locations updated", locations });
  } catch (e) {
    res.status(500).json({ message: "Could not update locations" });
  }
});

// PUT /api/settings/toggles   body: { toggles: { guestBrowsing, ... } }
router.put("/toggles", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const t = req.body.toggles || {};
    const toggles = {};

    const VALID_KEYS = ["guestBrowsing", "showContactInfo", "newRegistrations", "emailNotifications"];
    VALID_KEYS.forEach((k) => {
      if (typeof t[k] === "boolean") toggles["toggles." + k] = t[k];
    });

    if (Object.keys(toggles).length === 0) {
      return res.status(400).json({ message: "No valid toggle keys provided" });
    }

    const updated = await AppSettings.findByIdAndUpdate(
      "global",
      { $set: { ...toggles, updatedAt: new Date() } },
      { upsert: true, new: true }
    );

    res.json({ message: "Toggles updated", toggles: updated.toggles });
  } catch (e) {
    res.status(500).json({ message: "Could not update toggles" });
  }
});

// POST /api/settings/announcements   body: { title, message, priority }
router.post("/announcements", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const title = normalizeText(req.body.title);
    const message = normalizeText(req.body.message);
    const priority = normalizeText(req.body.priority).toLowerCase();

    if (!title || !message) {
      return res.status(400).json({ message: "title and message are required" });
    }

    const validPriorities = ["info", "warning", "urgent"];
    const ann = await Announcement.create({
      title,
      message,
      priority: validPriorities.includes(priority) ? priority : "info",
      sentBy: normalizeText(req.body.sentBy) || "Admin",
      active: true
    });

    res.status(201).json({ message: "Announcement sent", announcement: ann });
  } catch (e) {
    res.status(500).json({ message: "Could not send announcement" });
  }
});

// DELETE /api/settings/announcements/:id
router.delete("/announcements/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const deleted = await Announcement.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Announcement not found" });
    res.json({ message: "Announcement deleted" });
  } catch (e) {
    res.status(500).json({ message: "Could not delete announcement" });
  }
});

// DELETE /api/settings/announcements  — clear ALL announcements (admin)
router.delete("/announcements", authMiddleware, requireAdmin, async (req, res) => {
  try {
    await Announcement.deleteMany({});
    res.json({ message: "All announcements cleared" });
  } catch (e) {
    res.status(500).json({ message: "Could not clear announcements" });
  }
});

module.exports = router;
