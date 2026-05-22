import mongoose, { Schema } from "mongoose";
const businessSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, lowercase: true },
    slug: { type: String, unique: true, lowercase: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    plan: {
      type: String,
      enum: ["free", "starter", "pro", "enterprise"],
      default: "free"
    },
    planExpiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
    timezone: { type: String, default: "Asia/Kolkata" },
    currency: { type: String, default: "INR" },
    logo: { type: String },
    address: { type: String },
    gstNumber: { type: String },
    phone: { type: String },
    email: { type: String },
    maxOutlets: { type: Number, default: 1 },
    features: { type: [String], default: [] },
    settings: {
      requireCustomerName: { type: Boolean, default: false },
      enableOnlineOrders: { type: Boolean, default: false },
      defaultTaxRate: { type: Number, default: 0 }
    }
    ,
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
