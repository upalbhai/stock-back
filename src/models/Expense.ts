import mongoose, { Schema } from "mongoose";

const expenseSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    outletId: { type: Schema.Types.ObjectId, ref: "Outlet", required: true },
    category: {
      type: String,
      enum: ["rent", "salary", "utilities", "supplies", "marketing", "maintenance", "other"],
      required: true
    },
    amount: { type: Number, required: true, min: 0 },
    note: { type: String },
    date: { type: Date, required: true, default: () => new Date() },
    receiptUrl: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

expenseSchema.index({ businessId: 1, outletId: 1, date: -1 });
expenseSchema.index({ businessId: 1, category: 1 });

export const Expense =
  mongoose.models.Expense || mongoose.model("Expense", expenseSchema);
