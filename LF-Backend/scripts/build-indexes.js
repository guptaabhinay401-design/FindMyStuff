require("dotenv").config();
const mongoose = require("mongoose");
const Item = require("../models/Item");

const MONGO_URI = "mongodb+srv://abhi_anusha:ccwMe37pGQZkETD@findmystuff.1up240j.mongodb.net/lostandfound?retryWrites=true&w=majority&appName=FindMyStuff";

mongoose.connect(MONGO_URI).then(async () => {
    console.log("Connected to MongoDB -> lostandfound");
    console.log("Optimizing Database Indices for performance...");
    
    // This tells Mongoose to create all indexes defined in the schema
    // that don't already exist on the server.
    await Item.createIndexes();
    console.log("Indexes built successfully! Admin dashboard queries will now be much faster.");
    
    await mongoose.disconnect();
}).catch(console.error);
