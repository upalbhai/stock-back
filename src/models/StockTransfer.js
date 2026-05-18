import mongoose, { Schema } from "mongoose";
const transferItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    unit: { type: String, default: "pcs" }
  },
  { _id: false }
);
const stockTransferSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    fromOutletId: { type: Schema.Types.ObjectId, ref: "Outlet", required: true },
    toOutletId: { type: Schema.Types.ObjectId, ref: "Outlet", required: true },
    items: { type: [transferItemSchema], default: [] },
    status: {
      type: String,
      enum: ["pending", "approved", "completed", "rejected"],
      default: "pending"
    },
    note: { type: String },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    completedAt: { type: Date }
  },
  { timestamps: true }
);
stockTransferSchema.index({ businessId: 1, status: 1 });
stockTransferSchema.index({ businessId: 1, fromOutletId: 1 });
stockTransferSchema.index({ businessId: 1, toOutletId: 1 });
const StockTransfer = mongoose.models.StockTransfer || mongoose.model("StockTransfer", stockTransferSchema);
export {
  StockTransfer
};
