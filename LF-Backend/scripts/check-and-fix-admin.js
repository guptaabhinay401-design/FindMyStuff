require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("../models/User");

const MONGO_URI = "mongodb+srv://abhi_anusha:ccwMe37pGQZkETD@findmystuff.1up240j.mongodb.net/lostandfound?retryWrites=true&w=majority&appName=FindMyStuff";

mongoose.connect(MONGO_URI).then(async () => {
    console.log("Analyzing 'lostandfound' database...");
    
    // Check all users with this email just in case there are duplicates
    let users = await User.find({ email: "guptaabhinay401@gmail.com" }).select("+password");
    console.log(`Found ${users.length} user(s) with this email.`);
    
    for (let u of users) {
        console.log("------------------------");
        console.log("ID:", u._id);
        console.log("Name:", u.name);
        console.log("Role:", u.role);
        console.log("Has Password?", !!u.password);
        
        if (u.password) {
            const match = await bcrypt.compare("FindMyStuff2408", u.password);
            console.log("Does password match 'FindMyStuff2408'?:", match ? "YES" : "NO");
        }

        // Force fix everything
        u.role = "admin";
        u.password = await bcrypt.hash("FindMyStuff2408", 10);
        await u.save();
        console.log("=> Fixed this user back to admin and correct password.");
    }
    
    await mongoose.disconnect();
    console.log("------------------------");
    console.log("DONE. Try logging in again!");
}).catch(console.error);
