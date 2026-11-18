import mongoose, { Schema } from "mongoose";

const walletSchema = new Schema({
  currency: { type: String, required: true },
  totalSales: { type: Number, default: 0 },
  pending: { type: Number, default: 0 },
  paid: { type: Number, default: 0 }
}, { _id: false });

const agentProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    agentCode: { type: String, unique: true, sparse: true },
    commissionPercentage: { type: Number, default: 0 },
    wallets: { type: [walletSchema], default: [] },
    totalSales: { type: Number, default: 0 },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

const AgentProfile = mongoose.models.AgentProfile || mongoose.model("AgentProfile", agentProfileSchema);
export { AgentProfile };
