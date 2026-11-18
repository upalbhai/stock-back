import mongoose, { Schema } from "mongoose";

const subscriptionSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    planId: { type: Schema.Types.ObjectId, ref: "Plan", required: true },
    billingCycle: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
    status: {
      type: String,
      enum: ["active", "past_due", "cancelled", "expired"],
      default: "active"
    },
    razorpayPaymentId: { type: String },
    razorpayOrderId: { type: String },
    razorpaySignature: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    cancelledAt: { type: Date }
  },
  { timestamps: true }
);

subscriptionSchema.index({ businessId: 1, status: 1 });
subscriptionSchema.index({ razorpayOrderId: 1 });

const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
export { Subscription };
