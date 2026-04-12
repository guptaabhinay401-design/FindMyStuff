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


// IMPORTANT
module.exports = router;