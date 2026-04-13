const express = require("express");
const router = express.Router();

const Item = require("../models/Item");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

const ADMIN_OVERVIEW_ITEM_FIELDS = "itemName type category location date reporterName email status flagged flagReason createdAt";
const ADMIN_ITEM_LIST_FIELDS = "itemName description type category location date reporterName phone email status flagged flagReason contactPublic possession reportedBy createdAt";
const ADMIN_USER_FIELDS = "name email mobile collegeId profileImage role isBlocked blockedAt createdAt";
const ITEM_STATUS_VALUES = new Set(["active", "resolved", "rejected"]);
const USER_ROLE_VALUES = new Set(["student", "admin"]);

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      message: "Unauthorized"
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Admin access required"
    });
  }

  next();
}

function clampPositiveInt(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseBooleanQuery(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return null;
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function buildPagination(pageValue, limitValue) {
  const page = clampPositiveInt(pageValue, 1, 1, 100000);
  const limit = clampPositiveInt(limitValue, 20, 1, 100);
  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
}

function buildUserFilter(query) {
  const filter = {};
  const search = normalizeText(query.search);
  const role = normalizeText(query.role).toLowerCase();

  if (USER_ROLE_VALUES.has(role)) {
    filter.role = role;
  }

  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    filter.$or = [
      { name: regex },
      { email: regex }
    ];
  }

  return filter;
}

function buildItemFilter(query) {
  const filter = {};
  const type = normalizeText(query.type).toLowerCase();
  const status = normalizeText(query.status).toLowerCase();
  const category = normalizeText(query.category);
  const search = normalizeText(query.search);
  const flagged = parseBooleanQuery(query.flagged);

  if (type === "lost" || type === "found") {
    filter.type = type;
  }

  if (ITEM_STATUS_VALUES.has(status)) {
    filter.status = status;
  }

  if (category) {
    filter.category = category;
  }

  if (typeof flagged === "boolean") {
    filter.flagged = flagged;
  }

  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    filter.$or = [
      { itemName: regex },
      { description: regex },
      { location: regex },
      { reporterName: regex },
      { email: regex }
    ];
  }

  return filter;
}

function buildPaginationPayload(page, limit, total) {
  const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1
  };
}

function serializeUser(user) {
  if (!user) {
    return null;
  }

  if (typeof user.toObject === "function") {
    return user.toObject();
  }

  return user;
}

function serializeItem(item) {
  if (!item) {
    return null;
  }

  if (typeof item.toObject === "function") {
    return item.toObject();
  }

  return item;
}

router.get("/overview", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const [
      lostCount,
      foundCount,
      userCount,
      resolvedCount,
      lostItems,
      foundItems,
      users
    ] = await Promise.all([
      Item.countDocuments({ type: "lost" }),
      Item.countDocuments({ type: "found" }),
      User.estimatedDocumentCount(),
      Item.countDocuments({ status: "resolved" }),
      Item.find({ type: "lost" })
        .sort({ createdAt: -1 })
        .limit(10)
        .select(ADMIN_OVERVIEW_ITEM_FIELDS)
        .lean(),
      Item.find({ type: "found" })
        .sort({ createdAt: -1 })
        .limit(10)
        .select(ADMIN_OVERVIEW_ITEM_FIELDS)
        .lean(),
      User.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select(ADMIN_USER_FIELDS)
        .lean()
    ]);

    res.json({
      counts: {
        lost: lostCount,
        found: foundCount,
        users: userCount,
        resolved: resolvedCount
      },
      lostItems,
      foundItems,
      users
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not load admin overview"
    });
  }
});

router.get("/users", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { page, limit, skip } = buildPagination(req.query.page, req.query.limit);
    const filter = buildUserFilter(req.query);

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(ADMIN_USER_FIELDS)
        .lean()
    ]);

    res.json({
      users,
      pagination: buildPaginationPayload(page, limit, total)
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not load users"
    });
  }
});

router.put("/users/:id/block", authMiddleware, requireAdmin, async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        message: "You cannot block your own account"
      });
    }

    const user = await User.findById(req.params.id).select(ADMIN_USER_FIELDS);
    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    user.isBlocked = !user.isBlocked;
    user.blockedAt = user.isBlocked ? new Date() : null;
    await user.save();

    res.json({
      message: user.isBlocked ? "User blocked successfully" : "User unblocked successfully",
      user: serializeUser(user)
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not update block status"
    });
  }
});

router.put("/users/:id/role", authMiddleware, requireAdmin, async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        message: "You cannot change your own role"
      });
    }

    const role = normalizeText(req.body.role).toLowerCase();
    if (!USER_ROLE_VALUES.has(role)) {
      return res.status(400).json({
        message: "Role must be either student or admin"
      });
    }

    const user = await User.findById(req.params.id).select(ADMIN_USER_FIELDS);
    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    user.role = role;
    await user.save();

    res.json({
      message: "User role updated successfully",
      user: serializeUser(user)
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not update user role"
    });
  }
});

router.delete("/users/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        message: "You cannot delete your own account"
      });
    }

    const deletedUser = await User.findOneAndDelete({ _id: req.params.id }).select(ADMIN_USER_FIELDS).lean();
    if (!deletedUser) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    res.json({
      message: "User deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not delete user"
    });
  }
});

router.get("/items", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { page, limit, skip } = buildPagination(req.query.page, req.query.limit);
    const filter = buildItemFilter(req.query);

    const [total, items] = await Promise.all([
      Item.countDocuments(filter),
      Item.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(ADMIN_ITEM_LIST_FIELDS)
        .lean()
    ]);

    res.json({
      items,
      pagination: buildPaginationPayload(page, limit, total)
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not load items"
    });
  }
});

router.put("/items/:id/status", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const status = normalizeText(req.body.status).toLowerCase();
    if (!ITEM_STATUS_VALUES.has(status)) {
      return res.status(400).json({
        message: "Invalid item status"
      });
    }

    const item = await Item.findById(req.params.id).select(ADMIN_ITEM_LIST_FIELDS);
    if (!item) {
      return res.status(404).json({
        message: "Item not found"
      });
    }

    item.status = status;
    await item.save();

    res.json({
      message: "Item status updated successfully",
      item: serializeItem(item)
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not update item status"
    });
  }
});

router.put("/items/:id/flag", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const flagged = parseBooleanQuery(req.body.flagged);
    if (typeof flagged !== "boolean") {
      return res.status(400).json({
        message: "Flagged must be true or false"
      });
    }

    const item = await Item.findById(req.params.id).select(ADMIN_ITEM_LIST_FIELDS);
    if (!item) {
      return res.status(404).json({
        message: "Item not found"
      });
    }

    item.flagged = flagged;
    item.flagReason = flagged ? normalizeText(req.body.flagReason) : "";
    await item.save();

    res.json({
      message: flagged ? "Item flagged successfully" : "Item unflagged successfully",
      item: serializeItem(item)
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not update flag state"
    });
  }
});

router.put("/items/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    const { itemName, description, category, location } = req.body;
    if (itemName) item.itemName = String(itemName).trim();
    if (description !== undefined) item.description = String(description).trim();
    if (category) item.category = String(category).trim();
    if (location) item.location = String(location).trim();

    await item.save();
    res.json({ message: "Item updated successfully", item: serializeItem(item) });
  } catch (error) {
    res.status(500).json({ message: "Could not update item" });
  }
});

router.delete("/items/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const deletedItem = await Item.findOneAndDelete({ _id: req.params.id }).select(ADMIN_ITEM_LIST_FIELDS).lean();
    if (!deletedItem) {
      return res.status(404).json({
        message: "Item not found"
      });
    }

    res.json({
      message: "Item deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not delete item"
    });
  }
});

router.get("/stats", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const today = startOfDay(new Date());
    const startDate = startOfDay(today);
    startDate.setDate(startDate.getDate() - 6);
    const endDate = endOfDay(today);

    const [weeklyRaw, topCategories, topLocations, statusRaw] = await Promise.all([
      Item.aggregate([
        {
          $match: {
            createdAt: {
              $gte: startDate,
              $lte: endDate
            }
          }
        },
        {
          $project: {
            date: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt"
              }
            },
            type: 1
          }
        },
        {
          $group: {
            _id: {
              date: "$date",
              type: "$type"
            },
            count: {
              $sum: 1
            }
          }
        }
      ]),
      Item.aggregate([
        {
          $match: {
            category: {
              $nin: ["", null]
            }
          }
        },
        {
          $group: {
            _id: "$category",
            count: {
              $sum: 1
            }
          }
        },
        {
          $sort: {
            count: -1,
            _id: 1
          }
        },
        {
          $limit: 5
        }
      ]),
      Item.aggregate([
        {
          $match: {
            location: {
              $nin: ["", null]
            }
          }
        },
        {
          $group: {
            _id: "$location",
            count: {
              $sum: 1
            }
          }
        },
        {
          $sort: {
            count: -1,
            _id: 1
          }
        },
        {
          $limit: 5
        }
      ]),
      Item.aggregate([
        {
          $group: {
            _id: "$status",
            count: {
              $sum: 1
            }
          }
        }
      ])
    ]);

    const weeklyMap = new Map();
    weeklyRaw.forEach((entry) => {
      const key = entry._id.date + ":" + entry._id.type;
      weeklyMap.set(key, entry.count);
    });

    const weeklyActivity = [];
    for (let index = 0; index < 7; index += 1) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);
      const dateKey = date.toISOString().slice(0, 10);
      weeklyActivity.push({
        date: dateKey,
        lost: weeklyMap.get(dateKey + ":lost") || 0,
        found: weeklyMap.get(dateKey + ":found") || 0
      });
    }

    const statusBreakdown = {
      active: 0,
      resolved: 0,
      rejected: 0
    };

    statusRaw.forEach((entry) => {
      if (ITEM_STATUS_VALUES.has(entry._id)) {
        statusBreakdown[entry._id] = entry.count;
      }
    });

    res.json({
      weeklyActivity,
      topCategories: topCategories.map((entry) => ({
        category: entry._id,
        count: entry.count
      })),
      topLocations: topLocations.map((entry) => ({
        location: entry._id,
        count: entry.count
      })),
      statusBreakdown
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not load analytics"
    });
  }
});

module.exports = router;
