import mongoose, { Schema } from "mongoose";
const MODULES = [
  "billing",
  "inventory",
  "reports",
  "expenses",
  "users",
  "outlets",
  "roles",
  "dashboard",
  "settings",
  "transactions",
  "analytics",
  "stock_transfers",
  "audit_logs",
  "categories",
  "products"
];
const ACTIONS = [
  "create",
  "read",
  "update",
  "delete",
  "refund",
  "print",
  "export",
  "approve"
];
const permissionSchema = new Schema(
  {
    module: { type: String, required: true, enum: MODULES },
    actions: { type: [String], enum: ACTIONS, default: [] }
  },
  { _id: false }
);
const roleSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    permissions: { type: [permissionSchema], default: [] },
    outletScope: {
      type: String,
      enum: ["all", "restricted"],
      default: "all"
    },
    outletIds: {
      type: [Schema.Types.ObjectId],
      ref: "Outlet",
      default: []
    },
    isSystem: { type: Boolean, default: false }
    // system roles cannot be deleted
  },
  { timestamps: true }
);
roleSchema.index({ businessId: 1 });
const Role = mongoose.models.Role || mongoose.model("Role", roleSchema);
export {
  ACTIONS,
  MODULES,
  Role
};
