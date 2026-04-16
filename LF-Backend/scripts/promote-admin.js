require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("../models/User");

const ADMIN_EMAIL = "guptaabhinay401@gmail.com";
const NEW_PASSWORD = "FindMyStuff2408";
const password = "ccwMe37pGQZkETD";

// Try Render's EXACT URI format (no database name - like Render uses)
// MongoDB default db will be used
const RENDER_EXACT_URI = "mongodb+srv://abhi_anusha:" + password + "@findmystuff.1up240j.mongodb.net/?appName=FindMyStuff";

async function tryDatabase(uri, dbLabel) {
  const conn = await mongoose.createConnection(uri).asPromise();
  const UserModel = conn.model("User", User.schema);
  const users = await UserModel.find({ email: ADMIN_EMAIL }).select("+password");
  console.log("[" + dbLabel + "] Found " + users.length + " user(s)");
  for (const u of users) {
    console.log("  ID:", String(u._id), "| role:", u.role, "| oauth:", u.oauthProvider || "none", "| hasPassword:", !!u.password);
  }
  await conn.close();
  return users;
}

async function main() {
  console.log("=== Scanning all database variants ===\n");

  // 1. Render exact URI (no DB specified)
  try {
    const users = await tryDatabase(RENDER_EXACT_URI, "default/test DB");
    if (users.length > 0) {
      console.log("\n>>> Found in DEFAULT DB - Render uses this!");
      // Fix all
      const conn2 = await mongoose.createConnection(RENDER_EXACT_URI).asPromise();
      const UserModel2 = conn2.model("User", User.schema);
      const hash = await bcrypt.hash(NEW_PASSWORD, 10);
      const all = await UserModel2.find({ email: ADMIN_EMAIL }).select("+password");
      for (const u of all) {
        u.role = "admin";
        u.password = hash;
        u.oauthProvider = "";
        u.oauthSubject = "";
        await u.save();
        console.log("  FIXED:", String(u._id));
      }
      await conn2.close();
      console.log("\nSUCCESS: Login with FindMyStuff2408");
    }
  } catch(e) { console.log("[default DB] Error:", e.message); }

  // 2. lostandfound DB
  try {
    await tryDatabase("mongodb+srv://abhi_anusha:" + password + "@findmystuff.1up240j.mongodb.net/lostandfound?retryWrites=true&w=majority&appName=FindMyStuff", "lostandfound");
  } catch(e) { console.log("[lostandfound] Error:", e.message); }

  // 3. test DB
  try {
    await tryDatabase("mongodb+srv://abhi_anusha:" + password + "@findmystuff.1up240j.mongodb.net/test?appName=FindMyStuff", "test");
  } catch(e) { console.log("[test] Error:", e.message); }

  console.log("\nDone.");
  process.exit(0);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
