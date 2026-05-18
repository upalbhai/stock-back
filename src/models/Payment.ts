import mongoose, { Schema } from "mongoose";

const paymentSchema = new Schema(
  {
    outletId: { type: Schema.Types.ObjectId, ref: "Outlet", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    method: {
      type: String,
      enum: ["cash", "online", "card", "split"],
      required: true
    },
    amount: { type: Number, required: true },
    split: {
      cash: { type: Number, default: 0 },
      online: { type: Number, default: 0 },
      card: { type: Number, default: 0 }
    },
    receivedBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

export const Payment =
  mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
