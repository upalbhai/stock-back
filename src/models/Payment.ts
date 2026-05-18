import mongoose, { Schema } from "mongoose";

const paymentSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    outletId: { type: Schema.Types.ObjectId, ref: "Outlet", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    method: {
      type: String,
      enum: ["cash", "upi", "card", "wallet", "split"],
      required: true
    },
    amount: { type: Number, required: true, min: 0 },
    split: {
      cash: { type: Number, default: 0 },
      upi: { type: Number, default: 0 },
      card: { type: Number, default: 0 },
      wallet: { type: Number, default: 0 }
    },
    upiRef: { type: String }, // UPI transaction reference
    cardLast4: { type: String }, // last 4 digits
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "completed"
    },
    receivedBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

paymentSchema.index({ businessId: 1, outletId: 1, createdAt: -1 });
paymentSchema.index({ businessId: 1, method: 1 });

export const Payment =
  mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
