import mongoose, { Schema } from "mongoose";

const stockEntrySchema = new Schema(
  {
    outletId: { type: Schema.Types.ObjectId, ref: "Outlet", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    date: { type: Date, required: true },
    openingQty: { type: Number, required: true },
    soldQty: { type: Number, default: 0 },
    closingQty: { type: Number, default: 0 },
    wastageQty: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export const StockEntry =
  mongoose.models.StockEntry || mongoose.model("StockEntry", stockEntrySchema);
