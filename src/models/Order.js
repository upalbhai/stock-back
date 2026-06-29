import mongoose, { Schema } from "mongoose";
const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category" },
    name: { type: String, required: true },
    sku: { type: String },
    qty: { type: Number, required: true, min: 1 },
    unit: { type: String, default: "pcs" },
    soldUnit: { type: String },
    soldQty: { type: Number },
    baseQty: { type: Number },
    packagingUnitId: { type: Schema.Types.ObjectId, ref: "Unit" },
    conversionFactor: { type: Number, default: 1 },
    price: { type: Number, required: true },
    taxRate: { type: Number, default: 0 },
    hsnCode: { type: String },
    discount: { type: Number, default: 0 },
    taxableAmount: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
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
      enum: ["takeaway", "dine_in", "parcel", "quick", "wholesale"],
      default: "quick"
    },
    taxMode: {
      type: String,
      enum: ["exclusive", "inclusive"],
      default: "exclusive"
    },
    taxableAmount: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    supplyType: {
      type: String,
      enum: ["intra", "inter"],
      default: "intra"
    },
    customerName: { type: String },
    customerPhone: { type: String },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    amountPaid: { type: Number, default: 0, min: 0 },
    amountDue: { type: Number, default: 0, min: 0 },
    invoiceNumber: { type: String },
    invoiceGeneratedAt: { type: Date },
    invoiceGeneratedBy: { type: Schema.Types.ObjectId, ref: "User" },
    items: { type: [orderItemSchema], default: [] },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    tax: { type: Number, required: true },
    total: { type: Number, required: true },
    notes: { type: String },
    status: {
      type: String,
      enum: ["pending", "completed", "cancelled", "refunded", "voided"],
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
    refundReason: { type: String },
    voidedAt: { type: Date },
    voidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    voidReason: { type: String }
  },
  { timestamps: true }
);
orderSchema.index({ businessId: 1, outletId: 1, status: 1 });
orderSchema.index({ businessId: 1, outletId: 1, createdAt: -1 });
orderSchema.index({ businessId: 1, customerId: 1, createdAt: -1 });
orderSchema.index({ businessId: 1, orderNumber: 1 }, { unique: true });
orderSchema.index({ businessId: 1, invoiceNumber: 1 }, { sparse: true });
const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
export {
  Order
};
