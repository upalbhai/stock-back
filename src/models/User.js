import mongoose, { Schema } from "mongoose";
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    emailVerified: { type: Boolean, default: false },
    passwordHash: { type: String },
    businessId: { type: Schema.Types.ObjectId, ref: "Business" },
    outletIds: { type: [Schema.Types.ObjectId], ref: "Outlet", default: [] },
    roleId: { type: Schema.Types.ObjectId, ref: "Role" },
    role: {
      type: String,
      enum: ["superadmin", "owner", "manager", "staff"],
      default: "staff"
    },
    isActive: { type: Boolean, default: true },
    inviteToken: { type: String },
    inviteTokenExpiry: { type: Date },
    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },
    lastLoginDevice: { type: String }
  },
  { timestamps: true }
);
userSchema.index({ businessId: 1, isActive: 1 });
userSchema.index({ businessId: 1, role: 1 });
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { unique: true, sparse: true });
const User = mongoose.models.User || mongoose.model("User", userSchema);
export {
  User
};
