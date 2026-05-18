import mongoose, { Schema } from "mongoose";

const businessSchema = new Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User" },
    plan: { type: String, default: "free" },
    isActive: { type: Boolean, default: true },
    timezone: { type: String, default: "Asia/Kolkata" },
    currency: { type: String, default: "INR" }
  },
  { timestamps: true }
);

export const Business =
  mongoose.models.Business || mongoose.model("Business", businessSchema);
