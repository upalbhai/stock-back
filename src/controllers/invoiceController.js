import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Order } from "../models/Order.js";
import { Business } from "../models/Business.js";
import { Outlet } from "../models/Outlet.js";
import { Customer } from "../models/Customer.js";
import { AuditLog } from "../models/AuditLog.js";
import { getNextInvoiceNumber } from "../utils/invoiceNumber.js";

async function listInvoices(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, from, to, page = 1, limit = 50 } = req.query;
    const query = {
      businessId,
      invoiceNumber: { $exists: true, $ne: null },
      status: { $nin: ["voided", "cancelled"] },
    };
    if (outletId) query.outletId = outletId;
    if (from || to) {
      query.invoiceGeneratedAt = {};
      if (from) query.invoiceGeneratedAt.$gte = new Date(from);
      if (to) query.invoiceGeneratedAt.$lte = new Date(to);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ invoiceGeneratedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("customerId", "name phone gstin address")
        .populate("createdBy", "name")
        .lean(),
      Order.countDocuments(query),
    ]);

    return successResponse({
      res,
      data: {
        invoices: orders,
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getInvoice(req, res, next) {
  try {
    const { businessId } = req.user;
    const orderId = req.params.id;

    const order = await Order.findOne({
      _id: orderId,
      businessId,
      invoiceNumber: { $exists: true, $ne: null },
    })
      .populate("customerId", "name phone gstin address")
      .populate("createdBy", "name")
      .lean();

    if (!order) {
      return errorResponse({
        res,
        statusCode: 404,
        message: "GST invoice not found",
      });
    }

    const [business, outlet] = await Promise.all([
      Business.findById(businessId)
        .select("name gstNumber address phone email")
        .lean(),
      Outlet.findById(order.outletId).select("name address phone email").lean(),
    ]);

    return successResponse({
      res,
      data: { order, business, outlet },
    });
  } catch (error) {
    return next(error);
  }
}

async function generateInvoice(req, res, next) {
  try {
    const { businessId, userId } = req.user;
    const orderId = req.params.id;

    const order = await Order.findOne({ _id: orderId, businessId });
    if (!order) {
      return errorResponse({
        res,
        statusCode: 404,
        message: "Order not found",
      });
    }
    if (order.status === "voided" || order.status === "cancelled") {
      return errorResponse({
        res,
        statusCode: 400,
        message: "Cannot generate invoice for voided order",
      });
    }
    if (order.invoiceNumber) {
      return errorResponse({
        res,
        statusCode: 400,
        message: "Invoice already generated",
      });
    }
    if (!order.tax || order.tax <= 0) {
      return errorResponse({
        res,
        statusCode: 400,
        message: "Order has no GST/tax — enable tax on the bill first",
      });
    }
    if (!order.customerId) {
      return errorResponse({
        res,
        statusCode: 400,
        message: "Customer is required for GST invoice (buyer details)",
      });
    }

    const customer = await Customer.findById(order.customerId).lean();
    const customerGstin = (customer?.gstin ?? "")
      .toString()
      .trim()
      .toUpperCase();
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

    if (!customerGstin) {
      return errorResponse({
        res,
        statusCode: 400,
        message: "Customer GSTIN is required for GST invoice",
      });
    }

    if (!gstinRegex.test(customerGstin)) {
      return errorResponse({
        res,
        statusCode: 400,
        message: "Customer GSTIN is invalid. Enter a valid 15-character GSTIN",
      });
    }

    if ((customer?.gstin ?? "").toString() !== customerGstin) {
      await Customer.findByIdAndUpdate(order.customerId, {
        gstin: customerGstin,
      });
    }

    const business = await Business.findById(businessId)
      .select("gstNumber name")
      .lean();
    if (!business?.gstNumber) {
      return errorResponse({
        res,
        statusCode: 400,
        message: "Business GSTIN not configured — add it in Settings",
      });
    }

    const invoiceNumber = await getNextInvoiceNumber(businessId);
    await Order.findByIdAndUpdate(order._id, {
      invoiceNumber,
      invoiceGeneratedAt: new Date(),
      invoiceGeneratedBy: userId,
    });

    await AuditLog.create({
      businessId,
      outletId: order.outletId,
      actorId: userId,
      module: "invoices",
      action: "generate",
      targetType: "Order",
      targetId: order._id,
      targetName: invoiceNumber,
      message: `GST invoice ${invoiceNumber} generated for ${order.orderNumber}`,
      ip: req.ip,
    });

    const populated = await Order.findById(order._id)
      .populate("customerId", "name phone gstin address")
      .populate("createdBy", "name")
      .lean();

    return successResponse({
      res,
      statusCode: 201,
      data: { order: populated, invoiceNumber },
      message: "GST invoice generated",
    });
  } catch (error) {
    return next(error);
  }
}

export { listInvoices, getInvoice, generateInvoice };
