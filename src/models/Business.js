import mongoose, { Schema } from "mongoose";
const businessSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, lowercase: true },
    slug: { type: String, unique: true, lowercase: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    agentId: { type: Schema.Types.ObjectId, ref: "User" },
    // Legacy plan field kept for backward compat — prefer planId
    plan: {
      type: String,
      enum: ["free", "starter", "pro", "enterprise"],
      default: "free"
    },
    planId: { type: Schema.Types.ObjectId, ref: "Plan" },
    planExpiresAt: { type: Date },
    // Subscription & trial
    subscriptionStatus: {
      type: String,
      enum: ["trial", "grace_period", "payment_locked", "active", "expired", "cancelled"],
      default: "trial"
    },
    trialStartedAt: { type: Date },
    trialEndsAt: { type: Date },
    gracePeriodEndsAt: { type: Date },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    razorpayCustomerId: { type: String },
    razorpaySubscriptionId: { type: String },
    isActive: { type: Boolean, default: true },
    timezone: { type: String, default: "Asia/Kolkata" },
    currency: { type: String, default: "INR" },
    country: { type: String, default: "IN" },
    countryCode: { type: String, default: "IN" },
    detectedCountry: { type: String },
    signupIp: { type: String },
    isInternational: { type: Boolean, default: false },
    logo: { type: String },
    address: { type: String },
    gstNumber: { type: String },
    phone: { type: String },
    email: { type: String },
    maxOutlets: { type: Number, default: 1 },
    maxStaff: { type: Number, default: 5 },
    maxProducts: { type: Number, default: 50 },
    features: { type: [String], default: [] },
    planType: {
      type: String,
      enum: ["retail", "wholesale", "hybrid"],
      default: "retail"
    },
    businessProfile: {
      type: String,
      enum: ["retail", "wholesale", "hybrid"],
      default: "retail"
    },
    enabledFeatures: { type: [String], default: [] },
    customPlanDetails: {
      type: new Schema({
        price: { type: Number },
        currency: { type: String, default: "INR" },
        billingCycle: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
        maxProducts: { type: Number },
        maxOutlets: { type: Number },
        enabledFeatures: { type: [String], default: [] }
      }, { _id: false }),
      default: undefined
    },
    pendingCustomPlan: {
      type: new Schema({
        price: { type: Number },
        currency: { type: String, default: "INR" },
        billingCycle: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
        maxProducts: { type: Number },
        maxOutlets: { type: Number },
        enabledFeatures: { type: [String], default: [] },
        notes: { type: String },
        requestedAt: { type: Date },
        requestedBy: { type: Schema.Types.ObjectId, ref: "User" }
      }, { _id: false }),
      default: undefined
    },
    lastPlanRequestStatus: {
      status: { type: String, enum: ["approved", "rejected"] },
      reason: { type: String },
      date: { type: Date }
    },
    unlockRequest: {
      requestedAt: { type: Date },
      notes: { type: String },
      requestedDays: { type: Number, default: 3 },
      status: { type: String, enum: ["pending", "approved", "rejected"] },
      decidedAt: { type: Date },
      decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
      decisionNotes: { type: String }
    },
    reminders: {
      trialExpiringSentAt: { type: Date, default: null },
      trialExpiredSentAt: { type: Date, default: null },
      gracePeriodStartedSentAt: { type: Date, default: null },
      accountLockedSentAt: { type: Date, default: null }
    },
    billingMethod: {
      type: String,
      enum: ["standard", "manual"],
      default: "standard"
    },
    settings: {
      requireCustomerName: { type: Boolean, default: false },
      enableOnlineOrders: { type: Boolean, default: false },
      defaultTaxRate: { type: Number, default: 0 }
    },
    status: {
      type: String,
      enum: ["pending", "active", "suspended", "banned"],
      default: "active"
    },
    approvedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);
businessSchema.index({ ownerId: 1 });
const Business = mongoose.models.Business || mongoose.model("Business", businessSchema);
export {
  Business
};
