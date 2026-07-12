import mongoose, { Schema } from "mongoose";
const packagingUnitSchema = new Schema(
  {
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true },
    qtyPerUnit: { type: Number, required: true, min: 1 },
    price: { type: Number, min: 0 },
    costPrice: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, default: true }
  },
  { _id: false }
);

const productSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category" },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    sku: { type: String },
    barcode: { type: String },
    // unitId references the Unit collection (preferred). Keep `unit` string for
    // backward compatibility during migration.
    unitId: { type: Schema.Types.ObjectId, ref: "Unit" },
    unit: { type: String, default: "pcs" },
    // kg, liter, pcs, packets
    price: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, default: 0 },
    // for profit tracking
    taxRate: { type: Number, default: 0 },
    gstRate: { type: Number, default: 0 },
    hsnCode: { type: String },
    packagingUnits: { type: [packagingUnitSchema], default: [] },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    image: { type: String },
    tags: { type: [String], default: [] },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);
productSchema.index({ businessId: 1, isActive: 1 });
productSchema.index({ businessId: 1, categoryId: 1 });
productSchema.index({ businessId: 1, name: "text", sku: "text" });
const Product = mongoose.models.Product || mongoose.model("Product", productSchema);
export {
  Product
};
