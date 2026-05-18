import mongoose, { Schema } from "mongoose";
const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category" },
    name: { type: String, required: true },
    sku: { type: String },
    qty: { type: Number, required: true, min: 1 },
    unit: { type: String, default: "pcs" },
    price: { type: Number, required: true },
    taxRate: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    lineTotal: { type: Number, required: true },
    taxTotal: { type: Number, required: true },
    notes: { type: String }
  },
  { _id: false }
);
const orderSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    outletId: { type: Schema.Types.ObjectId, ref: "Outlet", required: true },
    orderNumber: { type: String, required: true },
    // e.g. ORD-001, auto-generated
    billingMode: {
      type: String,
      enum: ["takeaway", "dine_in", "parcel", "quick"],
      default: "quick"
    },
    customerName: { type: String },
    customerPhone: { type: String },
    items: { type: [orderItemSchema], default: [] },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    tax: { type: Number, required: true },
    total: { type: Number, required: true },
    notes: { type: String },
    status: {
      type: String,
      enum: ["pending", "completed", "cancelled", "refunded"],
      default: "completed"
    },
    paymentStatus: {
      type: String,
      enum: ["paid", "partial", "pending"],
      default: "paid"
    },
    payments: { type: [Schema.Types.ObjectId], ref: "Payment", default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    refundedAt: { type: Date },
    refundedBy: { type: Schema.Types.ObjectId, ref: "User" },
    refundReason: { type: String }
  },
  { timestamps: true }
);
orderSchema.index({ businessId: 1, outletId: 1, status: 1 });
orderSchema.index({ businessId: 1, outletId: 1, createdAt: -1 });
orderSchema.index({ businessId: 1, orderNumber: 1 }, { unique: true });
const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
export {
  Order
};
