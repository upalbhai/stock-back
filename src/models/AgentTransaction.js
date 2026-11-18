import mongoose, { Schema } from "mongoose";

const agentTransactionSchema = new Schema(
  {
    agentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["commission", "payout"],
      required: true
    },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: "INR" },
    referenceId: { type: String }, // Payment ID, Subscription ID, or PayoutRequest ID
    description: { type: String, required: true }
  },
  { timestamps: true }
);

agentTransactionSchema.index({ agentId: 1 });
agentTransactionSchema.index({ type: 1 });

const AgentTransaction = mongoose.models.AgentTransaction || mongoose.model("AgentTransaction", agentTransactionSchema);

export { AgentTransaction };
