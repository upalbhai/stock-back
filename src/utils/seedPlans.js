import { Plan } from "../models/Plan.js";
import { Business } from "../models/Business.js";
import { FEATURES, PLAN_FEATURE_TEMPLATES } from "../config/features.js";

export const PLANS = [
  {
    name: "Starter Retail",
    slug: "starter-retail",
    description: "For shopkeepers and cafés",
    monthlyPrice: 499,
    yearlyPrice: 4990,
    maxOutlets: 1,
    maxStaff: 5,
    maxProducts: 500,
    planType: "retail",
    featureKeys: PLAN_FEATURE_TEMPLATES.retail,
    features: ["Retail POS", "Order History", "Void Bills", "Email Support"],
    sortOrder: 1,
    isPopular: false
  },
  {
    name: "Wholesale Pro",
    slug: "wholesale-pro",
    description: "For distributors and bulk sellers",
    monthlyPrice: 999,
    yearlyPrice: 9990,
    maxOutlets: 3,
    maxStaff: 15,
    maxProducts: 5000,
    planType: "wholesale",
    featureKeys: PLAN_FEATURE_TEMPLATES.wholesale,
    features: ["Wholesale Billing", "Peti/Crate Units", "Credit/Khata", "GST Invoices"],
    sortOrder: 2,
    isPopular: true
  },
  {
    name: "Hybrid Business",
    slug: "hybrid-business",
    description: "Retail counter + wholesale bulk sales",
    monthlyPrice: 1499,
    yearlyPrice: 14990,
    maxOutlets: 5,
    maxStaff: 25,
    maxProducts: 10000,
    planType: "hybrid",
    featureKeys: PLAN_FEATURE_TEMPLATES.hybrid,
    features: ["Retail + Wholesale", "All Features", "Multi-outlet", "Priority Support"],
    sortOrder: 3,
    isPopular: false
  },
  {
    name: "Starter",
    slug: "starter",
    description: "Perfect for small shops",
    monthlyPrice: 499,
    yearlyPrice: 4990,
    maxOutlets: 1,
    maxStaff: 5,
    maxProducts: 500,
    planType: "retail",
    featureKeys: PLAN_FEATURE_TEMPLATES.retail,
    features: ["Basic Billing", "Inventory Tracking", "Email Support"],
    sortOrder: 4,
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
    planType: "hybrid",
    featureKeys: PLAN_FEATURE_TEMPLATES.hybrid,
    features: ["Multi-outlet Support", "Advanced Reports", "Priority Support"],
    sortOrder: 5,
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
    planType: "hybrid",
    featureKeys: PLAN_FEATURE_TEMPLATES.hybrid,
    features: ["Dedicated Account Manager", "Custom Integrations", "24/7 Phone Support"],
    sortOrder: 6,
    isPopular: false
  }
];

export async function seedPlansAndFeatures({ log = true } = {}) {
  if (log) {
    console.log(`Feature registry (${Object.keys(FEATURES).length} features):`);
    for (const f of Object.values(FEATURES)) {
      console.log(`  • ${f.key} — ${f.label}`);
    }
    console.log("");
    console.log("Upserting plans...");
  }

  for (const plan of PLANS) {
    const saved = await Plan.findOneAndUpdate({ slug: plan.slug }, { $set: plan }, { upsert: true, new: true });
    if (log) console.log(`  ✓ ${saved.name} (${saved.planType}) — ${saved.featureKeys.length} features`);
  }

  const proPlan = await Plan.findOne({ slug: "pro" });
  if (!proPlan) return { proPlan: null, assigned: 0, synced: 0 };

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 7);

  const withoutPlan = await Business.updateMany(
    { planId: { $exists: false } },
    {
      $set: {
        planId: proPlan._id,
        planType: proPlan.planType,
        businessProfile: proPlan.planType,
        enabledFeatures: proPlan.featureKeys,
        subscriptionStatus: "trial",
        trialStartedAt: new Date(),
        trialEndsAt,
        maxOutlets: proPlan.maxOutlets,
        maxStaff: proPlan.maxStaff,
        maxProducts: proPlan.maxProducts
      }
    }
  );

  const emptyFeatures = await Business.updateMany(
    { $or: [{ enabledFeatures: { $size: 0 } }, { enabledFeatures: { $exists: false } }] },
    {
      $set: {
        enabledFeatures: PLAN_FEATURE_TEMPLATES.hybrid,
        planType: "hybrid",
        businessProfile: "hybrid"
      }
    }
  );

  if (log) {
    console.log(`\nSynced businesses: ${withoutPlan.modifiedCount} assigned Pro plan, ${emptyFeatures.modifiedCount} got default features.`);
  }

  return { proPlan, assigned: withoutPlan.modifiedCount, synced: emptyFeatures.modifiedCount };
}
