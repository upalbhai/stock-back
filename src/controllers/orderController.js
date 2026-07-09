import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Order } from "../models/Order.js";
import { Payment } from "../models/Payment.js";
import { Product } from "../models/Product.js";
import { StockEntry } from "../models/StockEntry.js";
import { AuditLog } from "../models/AuditLog.js";
import { calculateLineTax, splitGstTax, resolveSupplyType, applySupplyTypeToLineItem } from "../utils/taxCalculator.js";
import { normalizeOrderItem, getItemStockQty } from "../utils/orderItemUtils.js";
import { Customer } from "../models/Customer.js";
import { Business } from "../models/Business.js";
import { applyCustomerDebit, reverseOrderCustomerLedger } from "../utils/customerLedger.js";
import { getNextInvoiceNumber } from "../utils/invoiceNumber.js";
import { getOrderLineCost } from "../utils/stockCostUtils.js";
import { withTransaction } from "../utils/transaction.js";

async function getNextOrderNumber(businessId) {
  const count = await Order.countDocuments({ businessId });
  return `ORD-${String(count + 1).padStart(4, "0")}`;
}

function buildOrderRecordStatusFilter(recordStatus) {
  if (recordStatus === "voided") return { status: "voided" };
  if (recordStatus === "refunded") return { status: "refunded" };
  if (recordStatus === "all") return {};
  return { status: { $nin: ["voided", "refunded", "cancelled"] } };
}

async function restoreOrderStock({ order, businessId, userId, notePrefix, entryType = "return", session }) {
  for (const item of order.items) {
    if (!item.productId) continue;
    const stockQty = getItemStockQty(item);
    const product = await Product.findById(item.productId).session(session);
    if (!product) continue;
    const qtyBefore = product.onHandQty;
    const qtyAfter = qtyBefore + stockQty;
    await Product.findByIdAndUpdate(item.productId, { $inc: { onHandQty: stockQty } }, { session });
    await new StockEntry({
      businessId,
      outletId: order.outletId,
      productId: item.productId,
      type: entryType,
      qty: stockQty,
      qtyBefore,
      qtyAfter,
      soldQty: item.soldQty,
      soldUnit: item.soldUnit,
      packagingUnitId: item.packagingUnitId,
      conversionFactor: item.conversionFactor,
      baseUnit: product.unitId?.abbreviation || product.unit,
      note: `${notePrefix}: ${order.orderNumber}`,
      referenceId: order._id,
      referenceType: "Order",
      createdBy: userId
    }).save({ session });
  }
}

async function createOrder(req, res, next) {
  try {
    return await withTransaction(async (session) => {
      const { businessId, userId } = req.user;
    const {
      outletId,
      items,
      billingMode,
      discount,
      notes,
      customerName,
      customerPhone,
      customerId,
      payment,
      taxMode = "exclusive",
      taxableAmount: bodyTaxable,
      cgst: bodyCgst,
      sgst: bodySgst,
      amountPaid: bodyAmountPaid,
      amountDue: bodyAmountDue,
      generateGstInvoice
    } = req.body;

    if (billingMode === "wholesale") {
      const enabled = req.enabledFeatures || [];
      if (!enabled.includes("wholesale_billing") && req.user?.role !== "superadmin") {
        return errorResponse({
          res,
          statusCode: 403,
          message: "Wholesale billing not available on your plan"
        });
      }
    }

    let subtotal = 0;
    let tax = 0;
    let taxableAmount = 0;
    let orderCgst = 0;
    let orderSgst = 0;
    let orderIgst = 0;

    for (const item of items) {
      let product = null;
      if (item.productId) {
        product = await Product.findById(item.productId)
          .populate({ path: "unitId", select: "name abbreviation key" })
          .populate({ path: "packagingUnits.unitId", select: "name abbreviation key" })
          .lean();
        if (product) {
          item.unit = product.unitId?.abbreviation || product.unit || item.unit || "pcs";
          if (item.price === undefined || item.price === null) item.price = product.price;
          if (item.taxRate === undefined || item.taxRate === null) {
            item.taxRate = product.gstRate || product.taxRate || 0;
          }
          if (product.hsnCode) item.hsnCode = product.hsnCode;
        }
      }

      normalizeOrderItem(item, product);

      const soldQty = item.soldQty ?? item.qty;
      const lineCalc = calculateLineTax({
        qty: soldQty,
        unitPrice: item.price,
        taxRatePercent: item.taxRate || 0,
        taxMode
      });

      const taxSplit = splitGstTax(lineCalc.taxTotal, "intra");
      item.taxableAmount = lineCalc.taxableAmount;
      item.lineTotal = lineCalc.lineTotal;
      item.taxTotal = lineCalc.taxTotal;
      item.cgst = taxSplit.cgst;
      item.sgst = taxSplit.sgst;
      item.igst = taxSplit.igst;

      subtotal += lineCalc.taxableAmount;
      tax += lineCalc.taxTotal;
      taxableAmount += lineCalc.taxableAmount;
      orderCgst += taxSplit.cgst;
      orderSgst += taxSplit.sgst;
      orderIgst += taxSplit.igst;
    }

    const discountAmount = discount || 0;
    const total = subtotal + tax - discountAmount;
    const orderNumber = await getNextOrderNumber(businessId);

    let resolvedCustomerId = customerId || null;
    let resolvedCustomerName = customerName;
    let resolvedCustomerPhone = customerPhone;
    let resolvedTaxMode = taxMode;
    let resolvedCustomer = null;

    if (resolvedCustomerId) {
      resolvedCustomer = await Customer.findOne({
        _id: resolvedCustomerId,
        businessId,
        isActive: true
      }).lean();
      if (!resolvedCustomer) {
        return errorResponse({ res, statusCode: 404, message: "Customer not found" });
      }
      resolvedCustomerName = resolvedCustomerName || resolvedCustomer.name;
      resolvedCustomerPhone = resolvedCustomerPhone || resolvedCustomer.phone;
      if (!req.body.taxMode && resolvedCustomer.defaultTaxMode) {
        resolvedTaxMode = resolvedCustomer.defaultTaxMode;
      }
    }

    const businessRecord = await Business.findById(businessId).select("gstNumber name").lean();
    const supplyType = resolveSupplyType(businessRecord?.gstNumber, resolvedCustomer?.gstin);

    if (supplyType === "inter") {
      orderCgst = 0;
      orderSgst = 0;
      orderIgst = tax;
      for (const item of items) {
        applySupplyTypeToLineItem(item, "inter");
      }
    }

    let amountPaid = 0;
    if (payment?.method === "split" && payment.split) {
      amountPaid = Object.values(payment.split).reduce((s, v) => s + (Number(v) || 0), 0);
    } else if (payment?.amount != null) {
      amountPaid = Number(payment.amount) || 0;
    } else if (payment?.method && payment.method !== "credit") {
      amountPaid = total;
    }

    if (bodyAmountPaid != null) amountPaid = Number(bodyAmountPaid);
    amountPaid = Math.min(Math.max(0, amountPaid), total);
    const amountDue = bodyAmountDue != null ? Number(bodyAmountDue) : Math.max(0, total - amountPaid);

    if (amountDue > 0) {
      const enabled = req.enabledFeatures || [];
      if (!enabled.includes("credit_khata") && req.user?.role !== "superadmin") {
        return errorResponse({
          res,
          statusCode: 403,
          message: "Credit/khata not available on your plan"
        });
      }
      if (!resolvedCustomerId) {
        return errorResponse({
          res,
          statusCode: 400,
          message: "Customer is required for credit or partial payment"
        });
      }
    }

    let paymentStatus = "paid";
    if (amountDue > 0 && amountPaid > 0) paymentStatus = "partial";
    else if (amountDue > 0) paymentStatus = "pending";

    let invoiceNumber = null;
    if (generateGstInvoice) {
      const enabled = req.enabledFeatures || [];
      if (!enabled.includes("gst_invoices") && req.user?.role !== "superadmin") {
        return errorResponse({
          res,
          statusCode: 403,
          message: "GST invoices not available on your plan"
        });
      }
      if (tax <= 0) {
        return errorResponse({ res, statusCode: 400, message: "Enable GST on the bill to generate a tax invoice" });
      }
      if (!resolvedCustomerId || !resolvedCustomer) {
        return errorResponse({ res, statusCode: 400, message: "Customer is required for GST invoice" });
      }
      if (!resolvedCustomer.gstin) {
        return errorResponse({ res, statusCode: 400, message: "Customer GSTIN is required for GST invoice" });
      }
      const business = businessRecord;
      if (!business?.gstNumber) {
        return errorResponse({
          res,
          statusCode: 400,
          message: "Business GSTIN not configured — add it in Settings"
        });
      }
      invoiceNumber = await getNextInvoiceNumber(businessId);
    }

    const order = await new Order({
      businessId,
      outletId,
      orderNumber,
      billingMode: billingMode || "quick",
      taxMode: resolvedTaxMode,
      items,
      subtotal,
      discount: discountAmount,
      tax,
      taxableAmount: taxableAmount || subtotal,
      cgst: orderCgst || bodyCgst || 0,
      sgst: orderSgst || bodySgst || 0,
      igst: orderIgst || 0,
      supplyType,
      total,
      amountPaid,
      amountDue,
      notes,
      customerName: resolvedCustomerName,
      customerPhone: resolvedCustomerPhone,
      customerId: resolvedCustomerId,
      paymentStatus,
      invoiceNumber,
      invoiceGeneratedAt: invoiceNumber ? new Date() : undefined,
      invoiceGeneratedBy: invoiceNumber ? userId : undefined,
      createdBy: userId
    }).save({ session });

    if (payment && amountPaid > 0) {
      let finalSplit = { ...payment.split };
      if (payment.method === "split") {
        const splitSum = Object.values(finalSplit).reduce((s, v) => s + (Number(v) || 0), 0);
        if (splitSum > amountPaid) {
          const diff = splitSum - amountPaid;
          finalSplit.cash = (Number(finalSplit.cash) || 0) - diff;
        }
      }

      const pmnt = await new Payment({
        businessId,
        outletId,
        orderId: order._id,
        method: payment.method === "credit" ? "cash" : payment.method || "cash",
        amount: amountPaid,
        split: finalSplit,
        receivedBy: userId
      }).save({ session });
      await Order.findByIdAndUpdate(order._id, { $push: { payments: pmnt._id } }, { session });
    }

    if (amountDue > 0 && resolvedCustomerId) {
      await applyCustomerDebit({
        customerId: resolvedCustomerId,
        businessId,
        outletId,
        amount: amountDue,
        orderId: order._id,
        userId,
        note: `Credit sale ${orderNumber}`,
        session
      });
    }

    for (const item of items) {
      if (item.productId) {
        const stockQty = getItemStockQty(item);
        const product = await Product.findById(item.productId).session(session);
        if (product) {
          const qtyBefore = product.onHandQty;
          const qtyAfter = qtyBefore - stockQty;
          const lineRevenueRaw = item.lineTotal ?? 0;
          let lineDiscount = 0;
          if (subtotal > 0 && discountAmount > 0) {
            lineDiscount = discountAmount * (lineRevenueRaw / subtotal);
          }
          const lineRevenue = lineRevenueRaw - lineDiscount;
          const lineCost = getOrderLineCost(product, item);
          await Product.findByIdAndUpdate(item.productId, { $inc: { onHandQty: -stockQty } }, { session });
          await new StockEntry({
            businessId,
            outletId,
            productId: item.productId,
            type: "sale",
            qty: -stockQty,
            qtyBefore,
            qtyAfter,
            soldQty: item.soldQty,
            soldUnit: item.soldUnit,
            packagingUnitId: item.packagingUnitId,
            conversionFactor: item.conversionFactor,
            baseUnit: product.unitId?.abbreviation || product.unit,
            note: `Order ${orderNumber}${item.soldUnit ? ` (${item.soldQty} ${item.soldUnit})` : ""}`,
            referenceId: order._id,
            referenceType: "Order",
            createdBy: userId,
            realizedRevenue: lineRevenue,
            realizedCost: lineCost,
            realizedProfit: lineRevenue - lineCost
          }).save({ session });
        }
      }
    }

    await new AuditLog({
      businessId,
      outletId,
      actorId: userId,
      module: "billing",
      action: "create_order",
      targetType: "Order",
      targetId: order._id,
      targetName: orderNumber,
      message: `Order ${orderNumber} created — ₹${total}`,
      ip: req.ip
    }).save({ session });

    const populated = await Order.findById(order._id)
      .populate("payments")
      .populate("createdBy", "name")
      .session(session)
      .lean();

    return successResponse({
      res: res,
      statusCode: 201,
      data: { order: populated }
    });
    });
  } catch (error) {
    return next(error);
  }
}

async function listOrders(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, status, recordStatus = "active", from, to, page = 1, limit = 50 } = req.query;
    const query = { businessId };
    if (outletId) query.outletId = outletId;
    if (status) {
      query.status = status;
    } else {
      Object.assign(query, buildOrderRecordStatusFilter(recordStatus));
    }
    
    if (req.query.search) {
      const q = req.query.search.trim();
      if (q) {
        query.$or = [
          { orderNumber: { $regex: q, $options: "i" } },
          { customerName: { $regex: q, $options: "i" } },
          { customerPhone: { $regex: q, $options: "i" } }
        ];
      }
    }
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total, orderIds] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("payments")
        .populate("createdBy", "name")
        .populate("voidedBy", "name")
        .populate("refundedBy", "name")
        .lean(),
      Order.countDocuments(query),
      Order.find(query).distinct("_id")
    ]);
    
    const paymentsRaw = await Payment.find({ orderId: { $in: orderIds } }).lean();
    const payMap = { cash: 0, upi: 0, card: 0, wallet: 0 };
    
    for (const p of paymentsRaw) {
      if (p.method === "split" && p.split) {
        payMap.cash += Number(p.split.cash) || 0;
        payMap.upi += Number(p.split.upi) || 0;
        payMap.card += Number(p.split.card) || 0;
        payMap.wallet += Number(p.split.wallet) || 0;
      } else if (p.method && p.method !== "credit") {
        payMap[p.method] = (payMap[p.method] || 0) + (Number(p.amount) || 0);
      }
    }
    
    const payments = Object.entries(payMap)
      .filter(([_, amount]) => amount > 0)
      .map(([payment_type, amount]) => ({ payment_type, amount }));

    return successResponse({
      res: res,
      data: {
        orders,
        payments,
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function getOrder(req, res, next) {
  try {
    const { businessId } = req.user;
    const order = await Order.findOne({ _id: req.params.id, businessId })
      .populate("payments")
      .populate("createdBy", "name")
      .populate("voidedBy", "name")
      .populate("refundedBy", "name")
      .lean();
    if (!order) {
      return errorResponse({ res, statusCode: 404, message: "Order not found" });
    }
    return successResponse({ res, data: { order } });
  } catch (error) {
    return next(error);
  }
}

async function refundOrder(req, res, next) {
  try {
    return await withTransaction(async (session) => {
      const { businessId, userId } = req.user;
      const { reason } = req.body;
      const order = await Order.findOne({ _id: req.params.id, businessId }).session(session);
      if (!order) {
        return errorResponse({ res, statusCode: 404, message: "Order not found" });
      }
      if (order.status === "refunded") {
        return errorResponse({ res, statusCode: 400, message: "Already refunded" });
      }
      if (order.status === "voided") {
        return errorResponse({ res, statusCode: 400, message: "Cannot refund a voided order" });
      }

      await Order.findByIdAndUpdate(order._id, {
        status: "refunded",
        paymentStatus: "pending",
        refundedAt: new Date(),
        refundedBy: userId,
        refundReason: reason
      }, { session });

      await restoreOrderStock({
        order,
        businessId,
        userId,
        notePrefix: "Refund",
        entryType: "return",
        session
      });

      await reverseOrderCustomerLedger({
        order,
        userId,
        reason: `Refund: ${reason}`,
        type: "credit_note",
        session
      });

      await new AuditLog({
        businessId,
        outletId: order.outletId,
        actorId: userId,
        module: "billing",
        action: "refund",
        targetType: "Order",
        targetId: order._id,
        targetName: order.orderNumber,
        message: `Order ${order.orderNumber} refunded. Reason: ${reason}`,
        ip: req.ip
      }).save({ session });

      return successResponse({ res, message: "Order refunded and stock restored" });
    });
  } catch (error) {
    return next(error);
  }
}

async function voidOrder(req, res, next) {
  try {
    return await withTransaction(async (session) => {
      const { businessId, userId } = req.user;
      const { reason } = req.body;
      const order = await Order.findOne({ _id: req.params.id, businessId }).session(session);
      if (!order) {
        return errorResponse({ res, statusCode: 404, message: "Order not found" });
      }
      if (order.status === "voided") {
        return errorResponse({ res, statusCode: 400, message: "Already voided" });
      }
      if (order.status === "refunded") {
        return errorResponse({ res, statusCode: 400, message: "Cannot void a refunded order" });
      }

      await Order.findByIdAndUpdate(order._id, {
        status: "voided",
        paymentStatus: "pending",
        voidedAt: new Date(),
        voidedBy: userId,
        voidReason: reason
      }, { session });

      await restoreOrderStock({
        order,
        businessId,
        userId,
        notePrefix: "Void",
        entryType: "adjustment",
        session
      });

      await reverseOrderCustomerLedger({
        order,
        userId,
        reason: reason || `Void: ${order.orderNumber}`,
        session
      });

      await new AuditLog({
        businessId,
        outletId: order.outletId,
        actorId: userId,
        module: "billing",
        action: "void",
        targetType: "Order",
        targetId: order._id,
        targetName: order.orderNumber,
        message: `Order ${order.orderNumber} voided. Reason: ${reason}`,
        ip: req.ip
      }).save({ session });

      return successResponse({ res, message: "Order voided and stock restored" });
    });
  } catch (error) {
    return next(error);
  }
}

export { createOrder, getOrder, listOrders, refundOrder, voidOrder };
