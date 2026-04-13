const express = require("express");
const router = express.Router();

const Item = require("../models/Item");
const authMiddleware = require("../middleware/authMiddleware");


// Add item
router.post("/add", authMiddleware, async (req, res) => {

    try {

        const { itemName, description, type, location } = req.body;

        const newItem = new Item({
            itemName,
            description,
            type,
            location,
            reportedBy: req.user.id
        });

        await newItem.save();

        res.status(201).json({
            message: "Item reported successfully",
            item: newItem
        });

    } catch (error) {

        res.status(500).json({
            message: "Server error"
        });

    }

});


// Get all items
router.get("/all", async (req, res) => {

    try {

        const items = await Item.find();

        res.json(items);

    } catch (error) {

        res.status(500).json({
            message: "Server error"
        });

    }

});



// Get item active count
router.get("/active-count", async (req, res) => {
  try {
    const count = await Item.countDocuments({ status: "active" });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get single item by ID — privacy-aware
// Public: name, location, description, category, date, image, reporterName, status
// Contact fields (phone/email) only shown if contactPublic=true or user is admin
router.get("/:id", async (req, res) => {
  try {
    const item = await Item.findById(req.params.id)
      .populate("reportedBy", "name")
      .lean();

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Determine requester privilege level
    let isAdmin = false;
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        isAdmin = decoded.role === "admin";
      } catch (e) {
        // Not authenticated or invalid token — public user
      }
    }

    // Build sanitized response
    const result = { ...item };

    // Strip sensitive contact fields unless contactPublic or admin
    if (!isAdmin && !item.contactPublic) {
      delete result.phone;
      delete result.email;
    }

    // Strip oversized base64 images from detail view
    if (
      typeof result.image === "string" &&
      result.image.startsWith("data:") &&
      result.image.length > 2000000
    ) {
      result.image = result.imageThumb || "";
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});


// IMPORTANT
module.exports = router;