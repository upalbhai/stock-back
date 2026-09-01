import mongoose from "mongoose";

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "order:businessId" or "invoice:2026:businessId"
  seq: { type: Number, default: 0 }
});

export const Counter = mongoose.model("Counter", counterSchema);
