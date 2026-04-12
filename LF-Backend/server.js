// Load environment variables from .env file
require("dotenv").config();

// Import required packages
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// Import route files
const authRoutes = require("./routes/auth");
const itemRoutes = require("./routes/item");
const lostItemRoutes = require("./routes/lostItems");
const foundItemRoutes = require("./routes/foundItems");
const adminRoutes = require("./routes/admin");

// Create express app
const app = express();


// ================================
// Middleware
// ================================

// Enable CORS (so frontend can access backend)
app.use(cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// Allow secure hosted pages (for example ngrok) to talk to localhost backend during development
app.use((req, res, next) => {
    if (req.headers.origin) {
        res.header("Access-Control-Allow-Origin", req.headers.origin);
        res.header("Vary", "Origin");
    }

    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.headers["access-control-request-private-network"] === "true") {
        res.header("Access-Control-Allow-Private-Network", "true");
    }

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

// Parse incoming JSON requests
app.use(express.json({ limit: "15mb" }));


// ================================
// MongoDB Connection
// ================================

mongoose.connect(process.env.MONGO_URI)

.then(() => {
    console.log("MongoDB Connected ✅");
})

.catch((error) => {
    console.log("MongoDB Connection Error ❌", error);
});


// ================================
// Routes
// ================================

// Authentication routes
// Example: /api/auth/signup
app.use("/api/auth", authRoutes);

// Item routes
// Example: /api/items/add
app.use("/api/items", itemRoutes);

// Lost item routes used by frontend
// Example: /api/lost-items
app.use("/api/lost-items", lostItemRoutes);

// Found item routes used by frontend
// Example: /api/found-items
app.use("/api/found-items", foundItemRoutes);

// Admin routes
// Example: /api/admin/overview
app.use("/api/admin", adminRoutes);


// ================================
// Test Route
// ================================

app.get("/", (req, res) => {
    res.send("Backend Running Successfully 🚀");
});


// ================================
// Start Server
// ================================

// Define port
const PORT = process.env.PORT || 5001;

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
