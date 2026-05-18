import mongoose, { Schema } from "mongoose";

const categorySchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    outletId: { type: Schema.Types.ObjectId, ref: "Outlet" }, // null = shared across all outlets
    parentId: { type: Schema.Types.ObjectId, ref: "Category", default: null }, // null = top-level
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true },
    description: { type: String },
    icon: { type: String, default: "🍽️" }, // emoji icon
    color: { type: String, default: "#6366f1" }, // hex color for UI chips
    image: { type: String }, // image URL
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

categorySchema.index({ businessId: 1, parentId: 1, isActive: 1 });
categorySchema.index({ businessId: 1, slug: 1 }, { unique: true });

export const Category =
  mongoose.models.Category || mongoose.model("Category", categorySchema);
