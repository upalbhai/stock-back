import mongoose, { Schema } from "mongoose";

const brandSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true },
    logo: { type: String }, // image URL for brand logo
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

brandSchema.index({ businessId: 1, isActive: 1, name: 1 });
brandSchema.index({ businessId: 1, slug: 1 }, { unique: true });

const Brand = mongoose.models.Brand || mongoose.model("Brand", brandSchema);

export { Brand };
