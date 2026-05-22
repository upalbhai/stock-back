import mongoose, { Schema } from "mongoose";
const outletSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, lowercase: true },
    address: { type: String },
    phone: { type: String },
    email: { type: String },
    managerId: { type: Schema.Types.ObjectId, ref: "User" },
    isActive: { type: Boolean, default: true },
    taxEnabled: { type: Boolean, default: false },
    defaultTaxRate: { type: Number, default: 0 },
    billingModes: {
      type: [String],
      enum: ["takeaway", "dine_in", "parcel", "quick"],
      default: ["takeaway", "quick"]
    },
    settings: {
      enableUPI: { type: Boolean, default: true },
      enableCard: { type: Boolean, default: true },
      enableCash: { type: Boolean, default: true },
      enableWallet: { type: Boolean, default: false },
      requireCustomerName: { type: Boolean, default: false },
      printReceiptDefault: { type: Boolean, default: false }
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
outletSchema.index({ businessId: 1, isActive: 1 });
const Outlet = mongoose.models.Outlet || mongoose.model("Outlet", outletSchema);
export {
  Outlet
};
