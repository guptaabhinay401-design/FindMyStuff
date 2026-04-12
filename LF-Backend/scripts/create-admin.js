require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const User = require("../models/User");

const args = process.argv.slice(2);
const adminInput = {
  name: String(args[0] || "REPLACE_WITH_ADMIN_NAME").trim(),
  email: String(args[1] || "replace-with-admin-email@example.com").trim().toLowerCase(),
  password: String(args[2] || "REPLACE_WITH_ADMIN_PASSWORD"),
  mobile: String(args[3] || "0000000000").trim()
};

function hasPlaceholderValues(input) {
  return (
    !input.name ||
    !input.email ||
    !input.password ||
    input.name === "REPLACE_WITH_ADMIN_NAME" ||
    input.email === "replace-with-admin-email@example.com" ||
    input.password === "REPLACE_WITH_ADMIN_PASSWORD"
  );
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing in .env");
  }

  if (hasPlaceholderValues(adminInput)) {
    console.log("Usage:");
    console.log('  npm run create-admin -- "Your Name" "your@email.com" "yourPassword" "9876543210"');
    console.log("");
    console.log("Example:");
    console.log('  npm run create-admin -- "Abhinay" "abhinay@gmail.com" "MyStrongPass123" "9557074316"');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const passwordHash = await bcrypt.hash(adminInput.password, 10);
  const existingUser = await User.findOne({ email: adminInput.email });

  if (existingUser) {
    existingUser.name = adminInput.name;
    existingUser.mobile = adminInput.mobile;
    existingUser.password = passwordHash;
    existingUser.role = "admin";
    existingUser.oauthProvider = "";
    existingUser.oauthSubject = "";
    await existingUser.save();

    console.log("Existing user updated to admin successfully.");
    console.log("Email:", existingUser.email);
    return;
  }

  const adminUser = new User({
    name: adminInput.name,
    email: adminInput.email,
    password: passwordHash,
    mobile: adminInput.mobile,
    role: "admin"
  });

  await adminUser.save();

  console.log("Admin user created successfully.");
  console.log("Email:", adminUser.email);
}

main()
  .catch((error) => {
    console.error("Could not create admin user:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
