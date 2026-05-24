import mongoose from "mongoose";
import { Plan } from "./src/models/Plan.js";
import { Business } from "./src/models/Business.js";
import { env } from "./src/config/env.js";

async function migrate() {
  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const plansData = [
    {
      name: "Starter",
      slug: "starter",
      description: "Perfect for small shops",
      monthlyPrice: 499,
      yearlyPrice: 4990,
      maxOutlets: 1,
      maxStaff: 5,
      maxProducts: 500,
      features: ["Basic Billing", "Inventory Tracking", "Email Support"],
      isPopular: false
    },
    {
      name: "Pro",
      slug: "pro",
      description: "Best for growing businesses",
      monthlyPrice: 1499,
      yearlyPrice: 14990,
      maxOutlets: 5,
      maxStaff: 25,
      maxProducts: 5000,
      features: ["Multi-outlet Support", "Advanced Reports", "Priority Support"],
      isPopular: true
    },
    {
      name: "Enterprise",
      slug: "enterprise",
      description: "For large retail chains",
      monthlyPrice: 4999,
      yearlyPrice: 49990,
      maxOutlets: 50,
      maxStaff: 200,
      maxProducts: 50000,
      features: ["Dedicated Account Manager", "Custom Integrations", "24/7 Phone Support"],
      isPopular: false
    }
  ];

  for (const p of plansData) {
    await Plan.findOneAndUpdate({ slug: p.slug }, { $set: p }, { upsert: true });
  }

  const proPlan = await Plan.findOne({ slug: "pro" });
  
  if (proPlan) {
    const defaultTrialEnd = new Date();
    defaultTrialEnd.setDate(defaultTrialEnd.getDate() + 7);
    
    await Business.updateMany(
      { planId: { $exists: false } },
      { 
        $set: { 
          planId: proPlan._id,
          subscriptionStatus: "trial",
          trialStartedAt: new Date(),
          trialEndsAt: defaultTrialEnd,
          maxOutlets: proPlan.maxOutlets,
          maxStaff: proPlan.maxStaff,
          maxProducts: proPlan.maxProducts
        }
      }
    );
    console.log("Assigned default Pro plan + Trial to existing businesses.");
  }

  console.log("Migration complete.");
  process.exit(0);
}

migrate().catch(console.error);
