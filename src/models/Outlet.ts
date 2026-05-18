import mongoose, { Schema } from "mongoose";

const outletSchema = new Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    address: { type: String },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const Outlet =
  mongoose.models.Outlet || mongoose.model("Outlet", outletSchema);
