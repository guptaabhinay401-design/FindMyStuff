const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ── In-memory user cache (TTL: 30 seconds) ──────────────────────────────────
// Avoids a DB round-trip on every API call for the same user.
// Cache is invalidated automatically after 30 seconds, so block/role changes
// propagate within half a minute without needing a full page reload.
const userCache = new Map();
const CACHE_TTL_MS = 30 * 1000;

function getCached(userId) {
    const entry = userCache.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
        userCache.delete(userId);
        return null;
    }
    return entry.user;
}

function setCache(userId, user) {
    // Limit cache size to prevent unbounded memory growth
    if (userCache.size > 2000) userCache.clear();
    userCache.set(userId, { user, ts: Date.now() });
}

// Call this whenever a user's block/role status changes (e.g., after admin block action)
function invalidateCache(userId) {
    if (userId) userCache.delete(String(userId));
}

// ── Middleware ───────────────────────────────────────────────────────────────
module.exports = async function authMiddleware(req, res, next) {

    const token = req.header("Authorization");
    if (!token || !token.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "No token provided, access denied ❌"
        });
    }

    try {
        const actualToken = token.slice("Bearer ".length).trim();
        const decoded = jwt.verify(actualToken, process.env.JWT_SECRET);
        const userId = String(decoded.id);

        // Try cache first
        let user = getCached(userId);

        if (!user) {
            // Cache miss — query DB and populate cache
            user = await User.findById(userId)
                .select("_id email role isBlocked blockedAt")
                .lean();

            if (!user) {
                return res.status(401).json({
                    message: "User not found. Please log in again."
                });
            }
            setCache(userId, user);
        }

        // Admins bypass the block check — must always retain platform access
        const isAdmin = (user.role || "").toLowerCase() === "admin";

        if (!isAdmin && user.isBlocked) {
            return res.status(403).json({
                message: "Your account has been blocked by an administrator. Please contact support.",
                isBlocked: true,
                blockedAt: user.blockedAt || null
            });
        }

        req.user = {
            id: userId,
            email: user.email,
            role: user.role || "student"
        };

        next();

    } catch (error) {
        res.status(401).json({
            message: "Invalid token ❌"
        });
    }
};

module.exports.invalidateCache = invalidateCache;
