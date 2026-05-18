import mongoose, { Schema } from "mongoose";

const permissionSchema = new Schema(
  {
    module: { type: String, required: true },
    actions: { type: [String], default: [] }
  },
  { _id: false }
);

const roleSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    name: { type: String, required: true },
    description: { type: String },
    permissions: { type: [permissionSchema], default: [] },
    outletScope: {
      type: String,
      enum: ["all", "restricted"],
      default: "all"
    },
    outletIds: { type: [Schema.Types.ObjectId], ref: "Outlet", default: [] },
    isSystem: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const Role = mongoose.models.Role || mongoose.model("Role", roleSchema);
