import mongoose, { Schema } from "mongoose";

const customerTransactionSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    outletId: { type: Schema.Types.ObjectId, ref: "Outlet" },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    type: {
      type: String,
      enum: ["sale", "payment", "credit_note", "opening_balance", "void_reversal"],
      required: true
    },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true },
    status: {
      type: String,
      enum: ["active", "voided"],
      default: "active"
    },
    voidedAt: { type: Date },
    voidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    voidReason: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

customerTransactionSchema.index({ businessId: 1, customerId: 1, createdAt: -1 });
customerTransactionSchema.index({ businessId: 1, orderId: 1 });

const CustomerTransaction =
  mongoose.models.CustomerTransaction ||
  mongoose.model("CustomerTransaction", customerTransactionSchema);
export { CustomerTransaction };
