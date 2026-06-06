import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { User } from "./models/User.js";
import { Business } from "./models/Business.js";
import { Outlet } from "./models/Outlet.js";
import { Role } from "./models/Role.js";
import { createDefaultRoles } from "./controllers/authController.js";
import { seedPlansAndFeatures } from "./utils/seedPlans.js";

dotenv.config();

async function seed() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI is not defined in .env file");
    }

    console.log("Connecting to Database...");
    await mongoose.connect(mongoUri);
    console.log("Connected successfully!");

    // Clear existing collections
    console.log("Clearing all collections from database...");
    await mongoose.connection.db.dropDatabase();
    console.log("Database cleared successfully!");

    const pin = "1234";
    const hashedPin = await bcrypt.hash(pin, 10);

    // 1. Create Super Admin
    console.log("Creating Super Admin...");
    const superadmin = await User.create({
      name: "Super Admin",
      phone: "9999999999",
      email: "superadmin@outletpulse.com",
      role: "superadmin",
      pinHash: hashedPin,
      isActive: true,
      emailVerified: true,
    });

    // 2. Create Owner User
    console.log("Creating Owner User...");
    const owner = await User.create({
      name: "Rahul Owner",
      phone: "9876543210",
      email: "rahul@outletpulse.com",
      role: "owner",
      pinHash: hashedPin,
      isActive: true,
      emailVerified: true,
    });

    // 3. Create Business
    console.log("Creating Business...");
    const business = await Business.create({
      name: "Anand Lassi Group",
      code: "anand-lassi",
      slug: "anand-lassi",
      ownerId: owner._id,
      plan: "pro",
      maxOutlets: 5,
      status: "active",
      isActive: true,
      approvedAt: new Date(),
      approvedBy: superadmin._id,
    });

    // Update Owner with businessId
    owner.businessId = business._id;

    // 4. Create Outlet
    console.log("Creating Outlet...");
    const outlet = await Outlet.create({
      businessId: business._id,
      name: "Anand Main Outlet",
      code: "anand-main",
      status: "active",
      isActive: true,
      approvedAt: new Date(),
      approvedBy: superadmin._id,
    });

    // Update Owner with outletIds
    owner.outletIds = [outlet._id];
    await owner.save();

    // 5. Create default roles for the business
    console.log("Creating default roles for Business...");
    await createDefaultRoles(business._id.toString());

    // Find the default Manager role to assign to a Manager user
    const managerRole = await Role.findOne({ businessId: business._id, name: "Manager" });

    // 6. Create Manager User
    console.log("Creating Manager User...");
    await User.create({
      name: "Manoj Manager",
      phone: "7777777777",
      email: "manoj@outletpulse.com",
      role: "manager",
      roleId: managerRole?._id,
      businessId: business._id,
      outletIds: [outlet._id],
      pinHash: hashedPin,
      isActive: true,
      emailVerified: true,
    });

    console.log("\nSeeding plans & features...");
    await seedPlansAndFeatures();

    console.log("\nDatabase seeded successfully!");
    console.log("--------------------------------------");
    console.log("Super Admin Login:");
    console.log("Phone: 9999999999");
    console.log("PIN: 1234");
    console.log("Email: superadmin@outletpulse.com");
    console.log("--------------------------------------");
    console.log("Owner Login:");
    console.log("Phone: 9876543210");
    console.log("PIN: 1234");
    console.log("Email: rahul@outletpulse.com");
    console.log("--------------------------------------");
    console.log("Manager Login:");
    console.log("Phone: 7777777777");
    console.log("PIN: 1234");
    console.log("Email: manoj@outletpulse.com");
    console.log("--------------------------------------");

    process.exit(0);
  } catch (error) {
    console.error("Seeding error:", error);
    process.exit(1);
  }
}

seed();
