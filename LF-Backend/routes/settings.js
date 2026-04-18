const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");

const AppSettings = require("../models/AppSettings");
const Announcement = require("../models/Announcement");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

// ── Nodemailer transporter ───────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ── Send announcement email to a single user ─────────────────
async function sendAnnouncementEmail(user, ann) {
  const transporter = createTransporter();
  const priorityColors = {
    info:    { bg: "#eff6ff", border: "#3b82f6", label: "📢 Info" },
    warning: { bg: "#fffbeb", border: "#d97706", label: "⚠️ Warning" },
    urgent:  { bg: "#fef2f2", border: "#dc2626", label: "🚨 Urgent" },
  };
  const style = priorityColors[ann.priority] || priorityColors.info;

  const html = `
  <!DOCTYPE html>
  <html>
  <head><meta charset='utf-8'></head>
  <body style='margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;'>
    <table width='100%' cellpadding='0' cellspacing='0' style='background:#f8fafc;padding:32px 0;'>
      <tr><td align='center'>
        <table width='560' cellpadding='0' cellspacing='0' style='background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);'>
          <!-- Header -->
          <tr>
            <td style='background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:28px 36px;'>
              <h1 style='margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;'>FindMyStuff</h1>
              <p style='margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;'>Platform Announcement</p>
            </td>
          </tr>
          <!-- Priority Badge -->
          <tr>
            <td style='padding:24px 36px 0;'>
              <div style='display:inline-block;background:${style.bg};border-left:4px solid ${style.border};border-radius:0 8px 8px 0;padding:6px 14px;font-size:12px;font-weight:700;color:${style.border};'>
                ${style.label}
              </div>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style='padding:20px 36px 28px;'>
              <h2 style='margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a;'>${ann.title}</h2>
              <p style='margin:0;font-size:15px;line-height:1.7;color:#334155;'>${ann.message}</p>
            </td>
          </tr>
          <!-- Divider -->
          <tr><td style='padding:0 36px;'><hr style='border:none;border-top:1px solid #e2e8f0;'></td></tr>
          <!-- Footer -->
          <tr>
            <td style='padding:20px 36px 28px;'>
              <p style='margin:0;font-size:12px;color:#94a3b8;'>Sent by ${ann.sentBy} &nbsp;·&nbsp; ${new Date(ann.createdAt).toLocaleString()}</p>
              <p style='margin:8px 0 0;font-size:12px;color:#94a3b8;'>This is an automated announcement from FindMyStuff platform.</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
  </html>`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `FindMyStuff <${process.env.SMTP_USER}>`,
    to: user.email,
    subject: `[FindMyStuff] ${ann.title}`,
    html,
  });
}

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

// POST /api/settings/announcements   body: { title, message, priority, sendEmail }
router.post("/announcements", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const title = normalizeText(req.body.title);
    const message = normalizeText(req.body.message);
    const priority = normalizeText(req.body.priority).toLowerCase();
    const sendEmail = req.body.sendEmail === true;

    if (!title || !message) {
      return res.status(400).json({ message: "title and message are required" });
    }

    const validPriorities = ["info", "warning", "urgent"];
    const ann = await Announcement.create({
      title,
      message,
      priority: validPriorities.includes(priority) ? priority : "info",
      sentBy: normalizeText(req.body.sentBy) || "Admin",
      active: true,
      emailSent: sendEmail,
    });

    // ── Send email blast (fire-and-forget, non-blocking) ─────
    if (sendEmail) {
      User.find({ isBlocked: { $ne: true }, email: { $exists: true, $ne: "" } })
        .select("email name")
        .lean()
        .then(async (users) => {
          let sent = 0, failed = 0;
          for (const u of users) {
            try {
              await sendAnnouncementEmail(u, ann);
              sent++;
            } catch (err) {
              failed++;
              console.warn(`Email failed for ${u.email}:`, err.message);
            }
          }
          console.log(`[Announcement Email] Sent: ${sent}, Failed: ${failed}, Total: ${users.length}`);
        })
        .catch((err) => console.error("[Announcement Email] DB error:", err.message));
    }

    res.status(201).json({
      message: sendEmail
        ? "Announcement sent + email blast queued!"
        : "Announcement sent",
      announcement: ann,
    });
  } catch (e) {
    console.error(e);
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
