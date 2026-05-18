import mongoose, { Schema } from "mongoose";

const transferItemSchema = new Schema(
  {
    sourceProductId: { type: Schema.Types.ObjectId, ref: "Product" },
    targetProductId: { type: Schema.Types.ObjectId, ref: "Product" },
    sku: { type: String },
    name: { type: String },
    qty: { type: Number, required: true }
  },
  { _id: false }
);

const stockTransferSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    fromOutletId: { type: Schema.Types.ObjectId, ref: "Outlet", required: true },
    toOutletId: { type: Schema.Types.ObjectId, ref: "Outlet", required: true },
    items: { type: [transferItemSchema], default: [] },
    note: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

export const StockTransfer =
  mongoose.models.StockTransfer ||
  mongoose.model("StockTransfer", stockTransferSchema);
