import mongoose, { Schema } from "mongoose";

const inventorySchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    outletId: { type: Schema.Types.ObjectId, ref: "Outlet", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    onHandQty: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 10 },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// Indexes for fast lookups
inventorySchema.index({ businessId: 1, outletId: 1, isActive: 1, _id: 1 });
inventorySchema.index({ outletId: 1, productId: 1 }, { unique: true });

const Inventory = mongoose.models.Inventory || mongoose.model("Inventory", inventorySchema);

export { Inventory };
