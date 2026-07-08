import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Order } from "../models/Order.js";
import { Outlet } from "../models/Outlet.js";
import { Customer } from "../models/Customer.js";
import { Product } from "../models/Product.js";
import { StockEntry } from "../models/StockEntry.js";
import { lossReasonLabel, getOrderLineCost } from "../utils/stockCostUtils.js";

function buildDateRangeQuery(from, to) {
  if (!from && !to) return null;
  const createdAt = {};
  if (from) {
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    createdAt.$gte = start;
  }
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    createdAt.$lte = end;
  }
  return createdAt;
}

async function computeSalesFromOrders(businessId, { outletId, from, to }) {
  const orderQuery = { businessId, status: "completed" };
  if (outletId) orderQuery.outletId = outletId;
  const createdAt = buildDateRangeQuery(from, to);
  if (createdAt) orderQuery.createdAt = createdAt;

  const orders = await Order.find(orderQuery)
    .select("items total subtotal orderNumber createdAt outletId createdBy")
    .populate("createdBy", "name")
    .lean();

  const productIds = new Set();
  for (const order of orders) {
    for (const item of order.items || []) {
      if (item.productId) productIds.add(item.productId.toString());
    }
  }

  const products = productIds.size
    ? await Product.find({ _id: { $in: [...productIds] } }).lean()
    : [];
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  let realizedRevenue = 0;
  let realizedCost = 0;

  for (const order of orders) {
    for (const item of order.items || []) {
      const lineRevenue = item.lineTotal ?? item.price * (item.qty || 0);
      realizedRevenue += lineRevenue;
      if (item.productId) {
        const product = productMap.get(item.productId.toString());
        realizedCost += getOrderLineCost(product, item);
      }
    }
  }

  return {
    realizedRevenue,
    realizedCost,
    realizedGrossProfit: realizedRevenue - realizedCost,
    ordersCount: orders.length,
    orders
  };
}

function enrichSaleEntry(entry, orderMap, productMap) {
  if (entry.type !== "sale") return entry;
  if (entry.realizedRevenue != null && entry.realizedRevenue > 0) return entry;

  const orderId = entry.referenceId?.toString?.() || String(entry.referenceId || "");
  const order = orderMap.get(orderId);
  if (!order) return entry;

  const productId = entry.productId?._id?.toString?.() || entry.productId?.toString?.() || "";
  const item = (order.items || []).find(
    (i) => i.productId?.toString() === productId
  );
  if (!item) return entry;

  const product = productMap.get(productId) || entry.productId;
  const lineRevenue = item.lineTotal ?? item.price * (item.qty || 0);
  const lineCost = getOrderLineCost(product, item);

  return {
    ...entry,
    realizedRevenue: lineRevenue,
    realizedCost: lineCost,
    realizedProfit: lineRevenue - lineCost,
    note: entry.note || `Order ${order.orderNumber}`
  };
}

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
    const { outletId, from, to } = req.query;
    let start, end;
    if (from && to) {
      start = new Date(from);
      start.setHours(0, 0, 0, 0);
      end = new Date(to);
      end.setHours(23, 59, 59, 999);
    } else {
      ({ start, end } = todayRange());
    }
    const query = { businessId, status: "completed", createdAt: { $gte: start, $lte: end } };
    if (outletId) query.outletId = outletId;
    const orders = await Order.find(query).populate("payments").populate("createdBy", "name").lean();
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
    const staffSalesMap = {};

    for (const order of orders) {
      // Aggregate product sales
      for (const item of order.items) {
        if (!productSales[item.name]) productSales[item.name] = { name: item.name, qty: 0, total: 0 };
        productSales[item.name].qty += item.qty;
        productSales[item.name].total += item.lineTotal;
      }
      
      // Aggregate staff sales
      const staffName = order.createdBy?.name || "Unknown/Online";
      if (!staffSalesMap[staffName]) staffSalesMap[staffName] = { name: staffName, revenue: 0, orders: 0 };
      staffSalesMap[staffName].revenue += order.total;
      staffSalesMap[staffName].orders += 1;
    }
    const bestSelling = Object.values(productSales).sort((a, b) => b.qty - a.qty).slice(0, 10);
    const staffSales = Object.values(staffSalesMap).sort((a, b) => b.revenue - a.revenue);

    const gstCollected = orders.reduce((s, o) => s + (o.tax || 0), 0);
    const wholesaleSales = orders
      .filter((o) => o.billingMode === "wholesale")
      .reduce((s, o) => s + o.total, 0);
    const creditIssued = orders.reduce((s, o) => s + (o.amountDue || 0), 0);
    const invoicesGenerated = orders.filter((o) => o.invoiceNumber).length;
    const igstCollected = orders.reduce((s, o) => s + (o.igst || 0), 0);
    const cgstCollected = orders.reduce((s, o) => s + (o.cgst || 0), 0);
    const sgstCollected = orders.reduce((s, o) => s + (o.sgst || 0), 0);

    return successResponse({
      res: res,
      data: {
        totalSales,
        totalOrders,
        paymentSummary,
        bestSelling,
        staffSales,
        gstCollected,
        wholesaleSales,
        creditIssued,
        invoicesGenerated,
        igstCollected,
        cgstCollected,
        sgstCollected
      }
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

async function getWholesaleSummary(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, from, to } = req.query;
    let start, end;
    if (from && to) {
      start = new Date(from);
      start.setHours(0, 0, 0, 0);
      end = new Date(to);
      end.setHours(23, 59, 59, 999);
    } else {
      ({ start, end } = todayRange());
    }

    const customerMatch = { businessId, isActive: true };
    const creditAgg = await Customer.aggregate([
      { $match: customerMatch },
      { $group: { _id: null, total: { $sum: "$outstandingBalance" }, count: { $sum: 1 } } }
    ]);
    const customersWithDue = await Customer.countDocuments({
      ...customerMatch,
      outstandingBalance: { $gt: 0 }
    });

    const orderQuery = {
      businessId,
      status: "completed",
      createdAt: { $gte: start, $lte: end }
    };
    if (outletId) orderQuery.outletId = outletId;

    const orders = await Order.find(orderQuery)
      .select("total tax billingMode amountDue invoiceNumber igst cgst sgst supplyType")
      .lean();

    const totalSalesToday = orders.reduce((s, o) => s + o.total, 0);
    const gstCollectedToday = orders.reduce((s, o) => s + (o.tax || 0), 0);
    const wholesaleSalesToday = orders
      .filter((o) => o.billingMode === "wholesale")
      .reduce((s, o) => s + o.total, 0);
    const creditIssuedToday = orders.reduce((s, o) => s + (o.amountDue || 0), 0);
    const invoicesToday = orders.filter((o) => o.invoiceNumber).length;
    const igstToday = orders.reduce((s, o) => s + (o.igst || 0), 0);
    const cgstSgstToday = orders.reduce((s, o) => s + (o.cgst || 0) + (o.sgst || 0), 0);

    return successResponse({
      res,
      data: {
        totalCreditOutstanding: creditAgg[0]?.total || 0,
        customersWithDue,
        totalCustomers: creditAgg[0]?.count || 0,
        totalSalesToday,
        totalOrdersToday: orders.length,
        gstCollectedToday,
        wholesaleSalesToday,
        creditIssuedToday,
        invoicesToday,
        igstToday,
        cgstSgstToday
      }
    });
  } catch (error) {
    return next(error);
  }
}

function classifyLedgerMovement(entry) {
  if (entry.type === "sale") {
    return {
      category: "sale",
      label: "Sale",
      hint: "Real profit — item sold to customer",
      isRealized: true,
      isLoss: false
    };
  }
  if (entry.qty > 0 && ["purchase", "opening", "transfer_in", "return"].includes(entry.type)) {
    return {
      category: "stock_in",
      label: entry.type === "return" ? "Good return (restocked)" : "Stock received",
      hint: "Potential margin only — not profit until sold",
      isRealized: false,
      isLoss: false
    };
  }
  if (entry.lossReason === "customer_return_spoiled") {
    return {
      category: "return_loss",
      label: "Customer return (spoiled)",
      hint: "Customer brought spoiled goods — counted as loss",
      isRealized: true,
      isLoss: true
    };
  }
  if (entry.lossReason === "owner_replacement") {
    return {
      category: "replacement",
      label: "Owner replacement",
      hint: "Free replacement given to customer — your cost",
      isRealized: true,
      isLoss: true
    };
  }
  if (entry.costLoss > 0 || entry.type === "wastage") {
    return {
      category: "shrinkage",
      label: lossReasonLabel(entry.lossReason || "spoilage"),
      hint: "Stock lost — spoilage, expiry, or damage",
      isRealized: true,
      isLoss: true
    };
  }
  return {
    category: "other",
    label: entry.type.replace(/_/g, " "),
    hint: "",
    isRealized: false,
    isLoss: false
  };
}

function formatLedgerRow(entry) {
  const meta = classifyLedgerMovement(entry);
  const product = entry.productId;
  return {
    _id: entry._id,
    createdAt: entry.createdAt,
    productName: product?.name || "Unknown",
    productUnit: entry.baseUnit || product?.unit || "pcs",
    type: entry.type,
    category: meta.category,
    categoryLabel: meta.label,
    categoryHint: meta.hint,
    isRealized: meta.isRealized,
    isLoss: meta.isLoss,
    qty: entry.qty,
    soldQty: entry.soldQty,
    soldUnit: entry.soldUnit,
    costValue: entry.costValue ?? 0,
    sellValue: entry.sellValue ?? 0,
    potentialMargin: entry.expectedProfit ?? 0,
    costLoss: entry.costLoss ?? 0,
    realizedRevenue: entry.realizedRevenue ?? 0,
    realizedCost: entry.realizedCost ?? 0,
    realizedProfit: entry.realizedProfit ?? 0,
    lossReason: entry.lossReason,
    note: entry.note,
    createdBy: entry.createdBy?.name,
    referenceType: entry.referenceType
  };
}

async function getProfitLedger(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, from, to, page = 1, limit = 50, search } = req.query;
    const query = { businessId };
    if (outletId) query.outletId = outletId;
    const createdAt = buildDateRangeQuery(from, to);
    if (createdAt) query.createdAt = createdAt;

    const term = String(search || "").trim();
    if (term) {
      const matchingProducts = await Product.find({
        businessId,
        $or: [
          { name: { $regex: term, $options: "i" } },
          { sku: { $regex: term, $options: "i" } }
        ]
      }).select("_id").lean();
      const productIds = matchingProducts.map((p) => p._id);
      const orConditions = [
        { note: { $regex: term, $options: "i" } },
        { lossReason: { $regex: term, $options: "i" } },
        { type: { $regex: term, $options: "i" } }
      ];
      if (productIds.length) orConditions.unshift({ productId: { $in: productIds } });
      query.$or = orConditions;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const salesFromOrders = await computeSalesFromOrders(businessId, { outletId, from, to });
    const orderMap = new Map(salesFromOrders.orders.map((o) => [o._id.toString(), o]));

    const productIds = new Set();
    for (const order of salesFromOrders.orders) {
      for (const item of order.items || []) {
        if (item.productId) productIds.add(item.productId.toString());
      }
    }

    const [entries, total, summaryAgg, products] = await Promise.all([
      StockEntry.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("productId", "name unit price costPrice onHandQty packagingUnits")
        .populate("createdBy", "name")
        .lean(),
      StockEntry.countDocuments(query),
      StockEntry.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            stockInvested: { $sum: { $cond: [{ $gt: ["$qty", 0] }, { $ifNull: ["$costValue", 0] }, 0] } },
            potentialMargin: { $sum: { $cond: [{ $gt: ["$qty", 0] }, { $ifNull: ["$expectedProfit", 0] }, 0] } },
            spoilageLoss: {
              $sum: {
                $cond: [
                  { $in: ["$lossReason", ["spoilage", "expiry", "damage", "other"]] },
                  { $ifNull: ["$costLoss", 0] },
                  0
                ]
              }
            },
            returnLoss: {
              $sum: {
                $cond: [
                  { $eq: ["$lossReason", "customer_return_spoiled"] },
                  { $ifNull: ["$costLoss", 0] },
                  0
                ]
              }
            },
            replacementCost: {
              $sum: {
                $cond: [
                  { $eq: ["$lossReason", "owner_replacement"] },
                  { $ifNull: ["$costLoss", 0] },
                  0
                ]
              }
            },
            totalLoss: { $sum: { $ifNull: ["$costLoss", 0] } }
          }
        }
      ]),
      outletId
        ? Product.find({ businessId, outletId, isActive: true }).select("onHandQty costPrice price packagingUnits").lean()
        : Product.find({ businessId, isActive: true }).select("onHandQty costPrice price packagingUnits").lean()
    ]);

    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    for (const id of productIds) {
      if (!productMap.has(id)) {
        const p = await Product.findById(id).lean();
        if (p) productMap.set(id, p);
      }
    }

    const raw = summaryAgg[0] || {
      stockInvested: 0,
      potentialMargin: 0,
      spoilageLoss: 0,
      returnLoss: 0,
      replacementCost: 0,
      totalLoss: 0
    };

    const onHandCostValue = products.reduce((s, p) => s + (p.onHandQty || 0) * (p.costPrice || 0), 0);
    const onHandSellValue = products.reduce((s, p) => s + (p.onHandQty || 0) * (p.price || 0), 0);

    const realizedRevenue = salesFromOrders.realizedRevenue;
    const realizedCost = salesFromOrders.realizedCost;
    const realizedGrossProfit = salesFromOrders.realizedGrossProfit;

    const summary = {
      ...raw,
      realizedRevenue,
      realizedCost,
      realizedGrossProfit,
      ordersCount: salesFromOrders.ordersCount,
      netProfit: realizedGrossProfit - raw.totalLoss,
      onHandCostValue,
      onHandSellValue,
      onHandPotentialMargin: onHandSellValue - onHandCostValue
    };

    const enrichedEntries = entries.map((e) => enrichSaleEntry(e, orderMap, productMap));
    const movements = enrichedEntries.map(formatLedgerRow);

    return successResponse({
      res,
      data: {
        summary,
        movements,
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)) || 1
      }
    });
  } catch (error) {
    return next(error);
  }
}

export {
  getDailyReport,
  getOutletComparison,
  getRevenueTrend,
  getWholesaleSummary,
  getProfitLedger
};
