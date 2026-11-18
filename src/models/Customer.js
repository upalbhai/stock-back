import mongoose, { Schema } from "mongoose";

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const customerSchema = new Schema(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    outletId: { type: Schema.Types.ObjectId, ref: "Outlet" },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      validate: {
        validator: (value) => !value || GSTIN_REGEX.test(value),
        message: "Invalid GSTIN format. Enter a valid 15-character GSTIN",
      },
    },
    address: { type: String, trim: true },
    defaultTaxMode: {
      type: String,
      enum: ["exclusive", "inclusive"],
      default: "exclusive",
    },
    outstandingBalance: { type: Number, default: 0, min: 0 },
    creditLimit: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

customerSchema.index({ businessId: 1, isActive: 1 });
customerSchema.index({ businessId: 1, phone: 1 });
customerSchema.index({ businessId: 1, name: 1 });

const Customer =
  mongoose.models.Customer || mongoose.model("Customer", customerSchema);
export { Customer };
