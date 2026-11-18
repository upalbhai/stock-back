import mongoose, { Schema } from "mongoose";
const stockEntrySchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    outletId: { type: Schema.Types.ObjectId, ref: "Outlet", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    type: {
      type: String,
      enum: ["opening", "purchase", "sale", "adjustment", "wastage", "transfer_in", "transfer_out", "return"],
      required: true
    },
    qty: { type: Number, required: true },
    // positive = in, negative = out
    qtyBefore: { type: Number, required: true },
    qtyAfter: { type: Number, required: true },
    soldQty: { type: Number },
    soldUnit: { type: String },
    packagingUnitId: { type: Schema.Types.ObjectId, ref: "Unit" },
    conversionFactor: { type: Number, min: 0 },
    baseUnit: { type: String },
    soldUnitCost: { type: Number, min: 0 },
    soldUnitPrice: { type: Number, min: 0 },
    costValue: { type: Number, min: 0 },
    sellValue: { type: Number, min: 0 },
    expectedProfit: { type: Number },
    lossReason: {
      type: String,
      enum: ["spoilage", "expiry", "damage", "customer_return_spoiled", "owner_replacement", "other"]
    },
    costLoss: { type: Number, min: 0 },
    realizedRevenue: { type: Number, min: 0 },
    realizedCost: { type: Number, min: 0 },
    realizedProfit: { type: Number },
    note: { type: String },
    referenceId: { type: Schema.Types.ObjectId },
    // orderId or transferId
    referenceType: { type: String },
    // "Order" | "StockTransfer"
    createdBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);
stockEntrySchema.index({ businessId: 1, outletId: 1, productId: 1, createdAt: -1 });
stockEntrySchema.index({ businessId: 1, outletId: 1, createdAt: -1 });
const StockEntry = mongoose.models.StockEntry || mongoose.model("StockEntry", stockEntrySchema);
export {
  StockEntry
};
