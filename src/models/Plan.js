import mongoose, { Schema } from "mongoose";

const planSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, trim: true },
    monthlyPrice: { type: Number, required: true, min: 0 },
    yearlyPrice: { type: Number, required: true, min: 0 },
    maxOutlets: { type: Number, default: 1 },
    maxStaff: { type: Number, default: 5 },
    maxProducts: { type: Number, default: 50 },
    features: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    isPopular: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    razorpayPlanIdMonthly: { type: String },
    razorpayPlanIdYearly: { type: String }
  },
  { timestamps: true }
);

const Plan = mongoose.models.Plan || mongoose.model("Plan", planSchema);
export { Plan };
