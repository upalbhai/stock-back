import mongoose, { Schema } from "mongoose";

const manualPaymentSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    agentId: { type: Schema.Types.ObjectId, ref: "User" }, // optional, for tracking
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    screenshotUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending_verification", "verified", "rejected"],
      default: "pending_verification"
    },
    commissionCalculated: { type: Boolean, default: false },
    commissionAmount: { type: Number, default: 0 },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

manualPaymentSchema.index({ businessId: 1 });
manualPaymentSchema.index({ agentId: 1 });

const ManualPayment = mongoose.models.ManualPayment || mongoose.model("ManualPayment", manualPaymentSchema);
export { ManualPayment };
