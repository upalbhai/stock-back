import mongoose, { Schema } from "mongoose";

const inviteSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    roleId: { type: Schema.Types.ObjectId, ref: "Role", required: true },
    outletIds: { type: [Schema.Types.ObjectId], ref: "Outlet", default: [] },
    phone: { type: String, required: true },
    tokenHash: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "expired"],
      default: "pending"
    },
    expiresAt: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

export const Invite =
  mongoose.models.Invite || mongoose.model("Invite", inviteSchema);
