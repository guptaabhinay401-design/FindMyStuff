const jwt = require("jsonwebtoken");
const User = require("../models/User");

// This middleware protects routes using JWT authentication
// It also checks if the user is blocked in the database
module.exports = async function(req, res, next) {

    // Get token from request header
    const token = req.header("Authorization");

    // If token is not present
    if (!token || !token.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "No token provided, access denied ❌"
        });
    }

    try {
        // Remove "Bearer" from token string
        const actualToken = token.slice("Bearer ".length).trim();

        // Verify token using secret key
        const decoded = jwt.verify(actualToken, process.env.JWT_SECRET);

        // Fetch fresh user from DB to check block status
        const user = await User.findById(decoded.id)
            .select("_id email role isBlocked blockedAt")
            .lean();

        if (!user) {
            return res.status(401).json({
                message: "User not found. Please log in again."
            });
        }

        // Admins always bypass the block check — they must retain platform access
        const isAdmin = (user.role || "").toLowerCase() === "admin";

        // Reject blocked users from all protected actions (non-admins only)
        if (!isAdmin && user.isBlocked) {
            return res.status(403).json({
                message: "Your account has been blocked by an administrator. Please contact support.",
                isBlocked: true,
                blockedAt: user.blockedAt || null
            });
        }

        // Attach user info to request
        req.user = {
            id: String(user._id),
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
