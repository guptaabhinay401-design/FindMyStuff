require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const User = require("../models/User");

const ADMIN_DETAILS = {
  name: "Abhinay Gupta",
  email: "guptaabhinay401@gmail.com",
  password: "FindMyStuff2408",
  mobile: "8439108465"
};

function hasPlaceholders() {
  return (
    !ADMIN_DETAILS.name ||
    !ADMIN_DETAILS.email ||
    !ADMIN_DETAILS.password ||
    ADMIN_DETAILS.name === "WRITE_YOUR_NAME_HERE" ||
    ADMIN_DETAILS.email === "write-your-email@example.com" ||
    ADMIN_DETAILS.password === "WRITE_YOUR_PASSWORD_HERE"
  );
}

async function run() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI missing in .env");
  }

  if (hasPlaceholders()) {
    throw new Error("Open scripts/make-admin-manual.js and replace the placeholder values first.");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const email = String(ADMIN_DETAILS.email).trim().toLowerCase();
  const passwordHash = await bcrypt.hash(String(ADMIN_DETAILS.password), 10);

  const existingUser = await User.findOne({ email: email });

  if (existingUser) {
    existingUser.name = String(ADMIN_DETAILS.name).trim();
    existingUser.mobile = String(ADMIN_DETAILS.mobile || "").trim();
    existingUser.password = passwordHash;
    existingUser.role = "admin";
    existingUser.oauthProvider = "";
    existingUser.oauthSubject = "";
    await existingUser.save();
    console.log("Existing user promoted to admin:", email);
    return;
  }

  const adminUser = await User.create({
    name: String(ADMIN_DETAILS.name).trim(),
    email: email,
    password: passwordHash,
    mobile: String(ADMIN_DETAILS.mobile || "").trim(),
    role: "admin"
  });

  console.log("New admin user created:", adminUser.email);
}

run()
  .catch((error) => {
    console.error("Admin setup failed:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
