import mongoose, { Schema } from "mongoose";

const productSchema = new Schema(
  {
    outletId: { type: Schema.Types.ObjectId, ref: "Outlet", required: true },
    name: { type: String, required: true },
    sku: { type: String },
    barcode: { type: String },
    unit: { type: String, required: true },
    price: { type: Number, required: true },
    taxRate: { type: Number, default: 0 },
    gstRate: { type: Number, default: 0 },
    onHandQty: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 10 },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const Product =
  mongoose.models.Product || mongoose.model("Product", productSchema);
