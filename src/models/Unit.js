import mongoose, { Schema } from "mongoose";
const unitSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    outletId: { type: Schema.Types.ObjectId, ref: "Outlet" },
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true, lowercase: true },
    abbreviation: { type: String },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);
unitSchema.index({ businessId: 1, isActive: 1 });
unitSchema.index({ businessId: 1, key: 1 }, { unique: true });
const Unit = mongoose.models.Unit || mongoose.model("Unit", unitSchema);
export {
  Unit
};
