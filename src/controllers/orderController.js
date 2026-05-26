import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Order } from "../models/Order.js";
import { Payment } from "../models/Payment.js";
import { Product } from "../models/Product.js";
import { StockEntry } from "../models/StockEntry.js";
import { AuditLog } from "../models/AuditLog.js";
async function getNextOrderNumber(businessId) {
  const count = await Order.countDocuments({ businessId });
  return `ORD-${String(count + 1).padStart(4, "0")}`;
}
async function createOrder(req, res, next) {
  try {
    const { businessId, userId } = req.user;
    const { outletId, items, billingMode, discount, notes, customerName, customerPhone, payment } = req.body;
    let subtotal = 0, tax = 0;
    for (const item of items) {
      const lineTotal = item.price * item.qty;
      const taxTotal = lineTotal * (item.taxRate || 0);
      item.lineTotal = lineTotal;
      item.taxTotal = taxTotal;
      subtotal += lineTotal;
      tax += taxTotal;
    }
    const discountAmount = discount || 0;
    const total = subtotal + tax - discountAmount;
    const orderNumber = await getNextOrderNumber(businessId);
    const order = await Order.create({
      businessId,
      outletId,
      orderNumber,
      billingMode: billingMode || "quick",
      items,
      subtotal,
      discount: discountAmount,
      tax,
      total,
      notes,
      customerName,
      customerPhone,
      createdBy: userId
    });
    if (payment) {
      const pmnt = await Payment.create({
        businessId,
        outletId,
        orderId: order._id,
        method: payment.method || "cash",
        amount: payment.amount || total,
        split: payment.split || {},
        receivedBy: userId
      });
      await Order.findByIdAndUpdate(order._id, {
        $push: { payments: pmnt._id },
        paymentStatus: "paid"
      });
    }
    for (const item of items) {
      if (item.productId) {
        const product = await Product.findById(item.productId);
        if (product) {
          const qtyBefore = product.onHandQty;
          const qtyAfter = qtyBefore - item.qty;
          await Product.findByIdAndUpdate(item.productId, { $inc: { onHandQty: -item.qty } });
          await StockEntry.create({
            businessId,
            outletId,
            productId: item.productId,
            type: "sale",
            qty: -item.qty,
            qtyBefore,
            qtyAfter,
            note: `Order ${orderNumber}`,
            referenceId: order._id,
            referenceType: "Order",
            createdBy: userId
          });
        }
      }
    }
    await AuditLog.create({
      businessId,
      outletId,
      actorId: userId,
      module: "billing",
      action: "create_order",
      targetType: "Order",
      targetId: order._id,
      targetName: orderNumber,
      message: `Order ${orderNumber} created \u2014 \u20B9${total}`,
      ip: req.ip
    });
    const populated = await Order.findById(order._id).populate("payments").populate("createdBy", "name").lean();
    return successResponse({
      res: res,
      statusCode: 201,

      data: {
        order: populated
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function listOrders(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, status, from, to, page = 1, limit = 50 } = req.query;
    const query = { businessId };
    if (outletId) query.outletId = outletId;
    if (status) query.status = status;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate("createdBy", "name").lean(),
      Order.countDocuments(query)
    ]);
    return successResponse({
      res: res,

      data: {
        orders,
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
    const order = await Order.findOne({ _id: req.params.id, businessId }).populate("payments").populate("createdBy", "name").lean();
    if (!order) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Order not found"
    });
    return successResponse({
      res: res,

      data: {
        order
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function refundOrder(req, res, next) {
  try {
    const { businessId, userId } = req.user;
    const { reason } = req.body;
    const order = await Order.findOne({ _id: req.params.id, businessId });
    if (!order) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Order not found"
    });
    if (order.status === "refunded") return errorResponse({
      res: res,
      statusCode: 400,
      message: "Already refunded"
    });
    await Order.findByIdAndUpdate(order._id, {
      status: "refunded",
      paymentStatus: "pending",
      refundedAt: /* @__PURE__ */ new Date(),
      refundedBy: userId,
      refundReason: reason
    });
    for (const item of order.items) {
      if (item.productId) {
        const product = await Product.findById(item.productId);
        if (product) {
          const qtyBefore = product.onHandQty;
          const qtyAfter = qtyBefore + item.qty;
          await Product.findByIdAndUpdate(item.productId, { $inc: { onHandQty: item.qty } });
          await StockEntry.create({
            businessId,
            outletId: order.outletId,
            productId: item.productId,
            type: "return",
            qty: item.qty,
            qtyBefore,
            qtyAfter,
            note: `Refund: ${order.orderNumber}`,
            referenceId: order._id,
            referenceType: "Order",
            createdBy: userId
          });
        }
      }
    }
    await AuditLog.create({
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
    });
    return successResponse({
      res: res,
      message: "Order refunded and stock restored"
    });
  } catch (error) {
    return next(error);
  }
}
export {
  createOrder,
  getOrder,
  listOrders,
  refundOrder
};
