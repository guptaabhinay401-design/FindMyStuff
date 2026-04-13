const express = require("express");
const router = express.Router();

const Claim = require("../models/Claim");
const Item = require("../models/Item");
const authMiddleware = require("../middleware/authMiddleware");

const CLAIM_STATUS_VALUES = new Set(["pending", "approved", "rejected"]);

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

function normalizeText(value) {
  return String(value || "").trim();
}

// POST /api/claims — Submit a new claim (auth required)
router.post("/", authMiddleware, async (req, res) => {
  try {
    const {
      itemId,
      claimMessage,
      proofDescription,
      contactName,
      contactPhone,
      contactEmail
    } = req.body;

    if (!itemId || !normalizeText(claimMessage)) {
      return res.status(400).json({
        message: "itemId and claimMessage are required"
      });
    }

    // Verify the item exists
    const item = await Item.findById(itemId).lean();
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Prevent duplicate claims from same user on same item
    const existing = await Claim.findOne({
      itemId,
      claimedBy: req.user.id
    });
    if (existing) {
      return res.status(409).json({
        message: "You have already submitted a claim for this item"
      });
    }

    const claim = new Claim({
      itemId,
      claimedBy: req.user.id,
      claimMessage: normalizeText(claimMessage),
      proofDescription: normalizeText(proofDescription),
      contactName: normalizeText(contactName),
      contactPhone: normalizeText(contactPhone),
      contactEmail: normalizeText(contactEmail)
    });

    const saved = await claim.save();

    res.status(201).json({
      message: "Claim submitted successfully",
      claim: {
        _id: saved._id,
        itemId: saved.itemId,
        status: saved.status,
        createdAt: saved.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Could not submit claim" });
  }
});

// GET /api/claims/my — Get current user's claims (auth required)
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const claims = await Claim.find({ claimedBy: req.user.id })
      .sort({ createdAt: -1 })
      .populate("itemId", "itemName type location date category status")
      .lean();

    res.json(claims);
  } catch (error) {
    res.status(500).json({ message: "Could not load your claims" });
  }
});

// GET /api/claims/item/:itemId — Get all claims for a specific item (admin)
router.get("/item/:itemId", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const claims = await Claim.find({ itemId: req.params.itemId })
      .sort({ createdAt: -1 })
      .populate("claimedBy", "name email mobile")
      .lean();

    res.json(claims);
  } catch (error) {
    res.status(500).json({ message: "Could not load claims for this item" });
  }
});

// GET /api/claims — Get all claims (admin only, paginated)
router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const page = clampInt(req.query.page, 1, 1, 100000);
    const limit = clampInt(req.query.limit, 20, 1, 100);
    const skip = (page - 1) * limit;

    const filter = {};
    const status = normalizeText(req.query.status).toLowerCase();
    if (CLAIM_STATUS_VALUES.has(status)) {
      filter.status = status;
    }

    const [total, claims] = await Promise.all([
      Claim.countDocuments(filter),
      Claim.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("itemId", "itemName type location category date")
        .populate("claimedBy", "name email mobile")
        .lean()
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    res.json({
      claims,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Could not load claims" });
  }
});

// PUT /api/claims/:id/status — Approve or Reject a claim (admin only)
router.put("/:id/status", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const status = normalizeText(req.body.status).toLowerCase();
    if (!CLAIM_STATUS_VALUES.has(status)) {
      return res.status(400).json({
        message: "Status must be pending, approved, or rejected"
      });
    }

    const claim = await Claim.findById(req.params.id);
    if (!claim) {
      return res.status(404).json({ message: "Claim not found" });
    }

    claim.status = status;
    claim.adminNote = normalizeText(req.body.adminNote);
    await claim.save();

    // If claim is approved, optionally mark item as resolved
    if (status === "approved") {
      await Item.findByIdAndUpdate(claim.itemId, { status: "resolved" }).catch(() => {});
    }

    res.json({
      message: status === "approved"
        ? "Claim approved and item marked as resolved"
        : "Claim status updated successfully",
      claim
    });
  } catch (error) {
    res.status(500).json({ message: "Could not update claim status" });
  }
});

// DELETE /api/claims/:id — Delete a claim (admin only)
router.delete("/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const deleted = await Claim.findByIdAndDelete(req.params.id).lean();
    if (!deleted) {
      return res.status(404).json({ message: "Claim not found" });
    }
    res.json({ message: "Claim deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Could not delete claim" });
  }
});

module.exports = router;
