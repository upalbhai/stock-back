import { Counter } from "../models/Counter.js";

export async function getNextInvoiceNumber(businessId) {
  const year = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `invoice:${year}:${businessId}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return `INV-${year}-${String(counter.seq).padStart(4, "0")}`;
}
