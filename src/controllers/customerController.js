import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Customer } from "../models/Customer.js";
import { CustomerTransaction } from "../models/CustomerTransaction.js";
import { AuditLog } from "../models/AuditLog.js";
import { applyCustomerCredit } from "../utils/customerLedger.js";

async function listCustomers(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, search, hasBalance, from, to, page = 1, limit = 50 } = req.query;
    const conditions = [{ businessId, isActive: true }];

    if (outletId) {
      conditions.push({ $or: [{ outletId }, { outletId: null }] });
    }
    if (hasBalance === "true") {
      conditions.push({ outstandingBalance: { $gt: 0 } });
    }
    if (search) {
      conditions.push({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
          { gstin: { $regex: search, $options: "i" } }
        ]
      });
    }
    if (from || to) {
      conditions.push({
        createdAt: {
          ...(from && { $gte: new Date(from) }),
          ...(to && { $lte: new Date(to) })
        }
      });
    }

    const query = conditions.length > 1 ? { $and: conditions } : conditions[0];

    const skip = (Number(page) - 1) * Number(limit);
    const [customers, total, stats] = await Promise.all([
      Customer.find(query)
        .sort({ name: 1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("createdBy", "name")
        .lean(),
      Customer.countDocuments(query),
      Customer.aggregate([
        { $match: query },
        { $group: { _id: null, totalOutstanding: { $sum: "$outstandingBalance" } } }
      ])
    ]);

    const totalOutstanding = stats[0]?.totalOutstanding || 0;

    return successResponse({
      res,
      data: {
        customers,
        total,
        totalOutstanding,
        page: Number(page),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function createCustomer(req, res, next) {
  try {
    const { businessId, userId } = req.user;
    const {
      outletId,
      name,
      phone,
      gstin,
      address,
      defaultTaxMode,
      creditLimit,
      openingBalance,
      note
    } = req.body;

    const customer = await Customer.create({
      businessId,
      outletId: outletId || null,
      name,
      phone,
      gstin,
      address,
      defaultTaxMode: defaultTaxMode || "exclusive",
      creditLimit: creditLimit || 0,
      outstandingBalance: openingBalance || 0,
      createdBy: userId
    });

    if (openingBalance && openingBalance > 0) {
      await CustomerTransaction.create({
        businessId,
        outletId: outletId || null,
        customerId: customer._id,
        type: "opening_balance",
        debit: openingBalance,
        credit: 0,
        balanceAfter: openingBalance,
        note: note || "Opening balance",
        createdBy: userId
      });
    }

    await AuditLog.create({
      businessId,
      outletId,
      actorId: userId,
      module: "customers",
      action: "create",
      targetType: "Customer",
      targetId: customer._id,
      targetName: customer.name,
      message: `Customer created: ${customer.name}`,
      ip: req.ip
    });

    return successResponse({ res, statusCode: 201, data: { customer } });
  } catch (error) {
    return next(error);
  }
}

async function getCustomer(req, res, next) {
  try {
    const { businessId } = req.user;
    const customer = await Customer.findOne({ _id: req.params.id, businessId, isActive: true })
      .populate("createdBy", "name")
      .lean();
    if (!customer) {
      return errorResponse({ res, statusCode: 404, message: "Customer not found" });
    }
    return successResponse({ res, data: { customer } });
  } catch (error) {
    return next(error);
  }
}

async function updateCustomer(req, res, next) {
  try {
    const { businessId, userId } = req.user;
    const allowed = ["name", "phone", "gstin", "address", "defaultTaxMode", "creditLimit", "outletId", "isActive"];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, businessId },
      { $set: update },
      { new: true }
    ).lean();

    if (!customer) {
      return errorResponse({ res, statusCode: 404, message: "Customer not found" });
    }

    await AuditLog.create({
      businessId,
      actorId: userId,
      module: "customers",
      action: "update",
      targetType: "Customer",
      targetId: customer._id,
      targetName: customer.name,
      message: `Customer updated: ${customer.name}`,
      ip: req.ip
    });

    return successResponse({ res, data: { customer } });
  } catch (error) {
    return next(error);
  }
}

async function getCustomerLedger(req, res, next) {
  try {
    const { businessId } = req.user;
    const { page = 1, limit = 50, recordStatus = "active", from, to } = req.query;

    const customer = await Customer.findOne({ _id: req.params.id, businessId, isActive: true }).lean();
    if (!customer) {
      return errorResponse({ res, statusCode: 404, message: "Customer not found" });
    }

    const txQuery = { businessId, customerId: customer._id };
    if (recordStatus === "active") txQuery.status = { $ne: "voided" };
    else if (recordStatus === "voided") txQuery.status = "voided";

    if (from || to) {
      txQuery.createdAt = {};
      if (from) txQuery.createdAt.$gte = new Date(from);
      if (to) txQuery.createdAt.$lte = new Date(to);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [transactions, total] = await Promise.all([
      CustomerTransaction.find(txQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("createdBy", "name")
        .populate("orderId", "orderNumber total")
        .lean(),
      CustomerTransaction.countDocuments(txQuery)
    ]);

    return successResponse({
      res,
      data: {
        customer,
        transactions,
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function recordCustomerPayment(req, res, next) {
  try {
    const { businessId, userId } = req.user;
    const { amount, method, note, outletId } = req.body;

    const customer = await Customer.findOne({ _id: req.params.id, businessId, isActive: true });
    if (!customer) {
      return errorResponse({ res, statusCode: 404, message: "Customer not found" });
    }
    if (amount <= 0) {
      return errorResponse({ res, statusCode: 400, message: "Payment amount must be positive" });
    }
    if (amount > customer.outstandingBalance) {
      return errorResponse({
        res,
        statusCode: 400,
        message: `Payment exceeds outstanding balance of ${customer.outstandingBalance}`
      });
    }

    const tx = await applyCustomerCredit({
      customerId: customer._id,
      businessId,
      outletId: outletId || customer.outletId,
      amount,
      userId,
      note: note || `Payment received (${method || "cash"})`
    });

    await AuditLog.create({
      businessId,
      outletId: outletId || customer.outletId,
      actorId: userId,
      module: "customers",
      action: "collect",
      targetType: "Customer",
      targetId: customer._id,
      targetName: customer.name,
      message: `Payment ${amount} received from ${customer.name}`,
      ip: req.ip
    });

    const updated = await Customer.findById(customer._id).lean();
    return successResponse({
      res,
      statusCode: 201,
      data: { transaction: tx, customer: updated },
      message: "Payment recorded"
    });
  } catch (error) {
    return next(error);
  }
}

export {
  listCustomers,
  createCustomer,
  getCustomer,
  updateCustomer,
  getCustomerLedger,
  recordCustomerPayment
};
