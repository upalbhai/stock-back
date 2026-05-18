import mongoose, { Schema } from "mongoose";

const auditLogSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business" },
    outletId: { type: Schema.Types.ObjectId, ref: "Outlet" },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    impersonatorId: { type: Schema.Types.ObjectId, ref: "User" },
    module: { type: String },
    action: { type: String, required: true },
    targetType: { type: String },
    targetId: { type: Schema.Types.ObjectId },
    message: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    meta: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

export const AuditLog =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
