import { Customer } from "../models/Customer.js";
import { CustomerTransaction } from "../models/CustomerTransaction.js";

function round2(n) {
  return Math.round(n * 100) / 100;
}

export async function applyCustomerDebit({
  customerId,
  businessId,
  outletId,
  amount,
  orderId,
  userId,
  note,
  type = "sale"
}) {
  const debitAmount = round2(amount);
  if (debitAmount <= 0) return null;

  const customer = await Customer.findOne({ _id: customerId, businessId, isActive: true });
  if (!customer) {
    const err = new Error("Customer not found");
    err.statusCode = 404;
    throw err;
  }

  if (customer.creditLimit > 0 && customer.outstandingBalance + debitAmount > customer.creditLimit) {
    const err = new Error(
      `Credit limit exceeded. Limit: ₹${customer.creditLimit}, current balance: ₹${customer.outstandingBalance}`
    );
    err.statusCode = 400;
    throw err;
  }

  const balanceAfter = round2(customer.outstandingBalance + debitAmount);
  await Customer.findByIdAndUpdate(customerId, { outstandingBalance: balanceAfter });

  return CustomerTransaction.create({
    businessId,
    outletId,
    customerId,
    type,
    orderId,
    debit: debitAmount,
    credit: 0,
    balanceAfter,
    note,
    createdBy: userId
  });
}

export async function applyCustomerCredit({
  customerId,
  businessId,
  outletId,
  amount,
  orderId,
  paymentId,
  userId,
  note,
  type = "payment"
}) {
  const creditAmount = round2(amount);
  if (creditAmount <= 0) return null;

  const customer = await Customer.findOne({ _id: customerId, businessId });
  if (!customer) {
    const err = new Error("Customer not found");
    err.statusCode = 404;
    throw err;
  }

  const balanceAfter = round2(Math.max(0, customer.outstandingBalance - creditAmount));
  await Customer.findByIdAndUpdate(customerId, { outstandingBalance: balanceAfter });

  return CustomerTransaction.create({
    businessId,
    outletId,
    customerId,
    type,
    orderId,
    paymentId,
    debit: 0,
    credit: creditAmount,
    balanceAfter,
    note,
    createdBy: userId
  });
}

export async function reverseOrderCustomerLedger({ order, userId, reason, type = "void_reversal" }) {
  if (!order.customerId || !order.amountDue || order.amountDue <= 0) return null;

  const existing = await CustomerTransaction.findOne({
    customerId: order.customerId,
    orderId: order._id,
    type: "sale",
    status: "active"
  });
  if (!existing) return null;

  await CustomerTransaction.findByIdAndUpdate(existing._id, {
    status: "voided",
    voidedAt: new Date(),
    voidedBy: userId,
    voidReason: reason
  });

  return applyCustomerCredit({
    customerId: order.customerId,
    businessId: order.businessId,
    outletId: order.outletId,
    amount: order.amountDue,
    orderId: order._id,
    userId,
    note: reason || `Reversal for ${order.orderNumber}`,
    type
  });
}
