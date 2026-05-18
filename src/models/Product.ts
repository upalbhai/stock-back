import mongoose, { Schema } from "mongoose";

const productSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    outletId: { type: Schema.Types.ObjectId, ref: "Outlet", required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category" },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    sku: { type: String },
    barcode: { type: String },
    unit: { type: String, required: true, default: "pcs" }, // kg, liter, pcs, packets
    price: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, default: 0 }, // for profit tracking
    taxRate: { type: Number, default: 0 },
    gstRate: { type: Number, default: 0 },
    onHandQty: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 10 },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    image: { type: String },
    tags: { type: [String], default: [] },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

productSchema.index({ businessId: 1, outletId: 1, isActive: 1 });
productSchema.index({ businessId: 1, categoryId: 1 });
productSchema.index({ businessId: 1, name: "text", sku: "text" });

export const Product =
  mongoose.models.Product || mongoose.model("Product", productSchema);
