import mongoose, { Schema } from "mongoose";

const payoutRequestSchema = new Schema(
  {
    agentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    currency: { type: String, required: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },
    transactionId: { type: String }, // Provided by admin upon approval
    notes: { type: String }, // Optional notes from admin
    processedAt: { type: Date },
    processedBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

payoutRequestSchema.index({ agentId: 1 });
payoutRequestSchema.index({ status: 1 });

const PayoutRequest = mongoose.models.PayoutRequest || mongoose.model("PayoutRequest", payoutRequestSchema);

export { PayoutRequest };
