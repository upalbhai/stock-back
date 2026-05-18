import mongoose, { Schema } from "mongoose";

const auditLogSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business" },
    outletId: { type: Schema.Types.ObjectId, ref: "Outlet" },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    actorName: { type: String }, // denormalized for quick display
    actorRole: { type: String },
    impersonatorId: { type: Schema.Types.ObjectId, ref: "User" }, // super admin impersonating
    impersonatorName: { type: String },
    module: { type: String },
    action: { type: String, required: true },
    targetType: { type: String }, // "Order", "Product", "User", etc.
    targetId: { type: Schema.Types.ObjectId },
    targetName: { type: String }, // denormalized name for display
    message: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    meta: { type: Schema.Types.Mixed } // extra details
  },
  { timestamps: true }
);

auditLogSchema.index({ businessId: 1, createdAt: -1 });
auditLogSchema.index({ businessId: 1, actorId: 1 });
auditLogSchema.index({ businessId: 1, module: 1 });

export const AuditLog =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
