import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { User } from "./models/User.js";

dotenv.config();

async function seedAdmin() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI is not defined in .env file");
    }

    console.log("Connecting to Database...");
    await mongoose.connect(mongoUri);
    console.log("Connected successfully!");

    console.log("Clearing all collections from database...");
    await mongoose.connection.db.dropDatabase();
    console.log("Database cleared successfully!");

    const password = "password123";
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log("Creating Super Admin...");
    await User.findOneAndUpdate(
      { email: "superadmin@outletpulse.com" },
      {
        name: "Super Admin",
        phone: "9999999999",
        email: "superadmin@outletpulse.com",
        role: "superadmin",
        passwordHash: hashedPassword,
        isActive: true,
        emailVerified: true,
      },
      { upsert: true, new: true }
    );

    console.log("\nAdmin seeded successfully!");
    console.log("--------------------------------------");
    console.log("Super Admin Login:");
    console.log("Email: superadmin@outletpulse.com");
    console.log("Password: password123");
    console.log("--------------------------------------");

    process.exit(0);
  } catch (error) {
    console.error("Seeding error:", error);
    process.exit(1);
  }
}

seedAdmin();
