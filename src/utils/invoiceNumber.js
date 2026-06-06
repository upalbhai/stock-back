import { Order } from "../models/Order.js";

export async function getNextInvoiceNumber(businessId) {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const count = await Order.countDocuments({
    businessId,
    invoiceNumber: { $regex: `^${prefix}` }
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}
