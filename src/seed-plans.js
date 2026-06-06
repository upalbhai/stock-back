import mongoose from "mongoose";
import dotenv from "dotenv";
import { seedPlansAndFeatures } from "./utils/seedPlans.js";

dotenv.config();

async function seedPlans() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined in .env file");
  }

  console.log("Connecting to database...");
  await mongoose.connect(mongoUri);
  console.log("Connected.\n");

  await seedPlansAndFeatures();

  console.log("\nPlans & features seeded successfully.");
  process.exit(0);
}

seedPlans().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
