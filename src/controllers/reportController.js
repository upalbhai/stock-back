import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Order } from "../models/Order.js";
import { Outlet } from "../models/Outlet.js";
function todayRange() {
  const start = /* @__PURE__ */ new Date();
  start.setHours(0, 0, 0, 0);
  const end = /* @__PURE__ */ new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}
async function getDailyReport(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, date } = req.query;
    let start, end;
    if (date) {
      start = new Date(date);
      start.setHours(0, 0, 0, 0);
      end = new Date(date);
      end.setHours(23, 59, 59, 999);
    } else {
      ({ start, end } = todayRange());
    }
    const query = { businessId, status: "completed", createdAt: { $gte: start, $lte: end } };
    if (outletId) query.outletId = outletId;
    const orders = await Order.find(query).populate("payments").lean();
    const totalSales = orders.reduce((s, o) => s + o.total, 0);
    const totalOrders = orders.length;
    const paymentSummary = { cash: 0, upi: 0, card: 0, wallet: 0, split: 0 };
    for (const order of orders) {
      for (const pmtId of order.payments) {
        const pmt = order.payments.find((p) => p._id.toString() === pmtId?.toString());
        if (pmt && typeof pmt === "object" && "method" in pmt) {
          const method = pmt.method;
          paymentSummary[method] = (paymentSummary[method] || 0) + pmt.amount;
        }
      }
    }
    const productSales = {};
    for (const order of orders) {
      for (const item of order.items) {
        if (!productSales[item.name]) productSales[item.name] = { name: item.name, qty: 0, total: 0 };
        productSales[item.name].qty += item.qty;
        productSales[item.name].total += item.lineTotal;
      }
    }
    const bestSelling = Object.values(productSales).sort((a, b) => b.qty - a.qty).slice(0, 10);
    return successResponse({
      res: res,
      data: { totalSales, totalOrders, paymentSummary, bestSelling }
    });
  } catch (error) {
    return next(error);
  }
}
async function getOutletComparison(req, res, next) {
  try {
    const { businessId } = req.user;
    const { from, to } = req.query;
    const { start, end } = from && to ? { start: new Date(from), end: new Date(to) } : todayRange();
    const outlets = await Outlet.find({ businessId, isActive: true }).lean();
    const result = await Promise.all(outlets.map(async (outlet) => {
      const orders = await Order.find({
        businessId,
        outletId: outlet._id,
        status: "completed",
        createdAt: { $gte: start, $lte: end }
      }).select("total").lean();
      const revenue = orders.reduce((s, o) => s + o.total, 0);
      return { outlet: { id: outlet._id, name: outlet.name }, revenue, orders: orders.length };
    }));
    return successResponse({
      res: res,

      data: {
        comparison: result
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function getRevenueTrend(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, days = 7 } = req.query;
    const numDays = Number(days);
    const trend = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const d = /* @__PURE__ */ new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      const query = { businessId, status: "completed", createdAt: { $gte: start, $lte: end } };
      if (outletId) query.outletId = outletId;
      const orders = await Order.find(query).select("total").lean();
      const revenue = orders.reduce((s, o) => s + o.total, 0);
      trend.push({ date: start.toISOString().split("T")[0], revenue, orders: orders.length });
    }
    return successResponse({
      res: res,

      data: {
        trend
      }
    });
  } catch (error) {
    return next(error);
  }
}
export {
  getDailyReport,
  getOutletComparison,
  getRevenueTrend
};
