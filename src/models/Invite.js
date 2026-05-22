import mongoose, { Schema } from "mongoose";
const inviteSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    outletIds: { type: [Schema.Types.ObjectId], ref: "Outlet", default: [] },
    roleId: { type: Schema.Types.ObjectId, ref: "Role" },
    role: {
      type: String,
      enum: ["manager", "staff"],
      default: "staff"
    },
    phone: { type: String },
    email: { type: String, lowercase: true, trim: true },
    // pre-filled on invite form
    name: { type: String },
    // pre-filled on invite form
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
    usedBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);
inviteSchema.index({ businessId: 1 });
const Invite = mongoose.models.Invite || mongoose.model("Invite", inviteSchema);
export {
  Invite
};
