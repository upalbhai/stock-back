import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Order } from "../models/Order.js";
import { Outlet } from "../models/Outlet.js";
import { Customer } from "../models/Customer.js";
import { Product } from "../models/Product.js";
import { Inventory } from "../models/Inventory.js";
import { StockEntry } from "../models/StockEntry.js";
import { lossReasonLabel, getOrderLineCost } from "../utils/stockCostUtils.js";
import mongoose from "mongoose";

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
    const query = {
      businessId: new mongoose.Types.ObjectId(businessId),
      status: "completed",
      createdAt: { $gte: start, $lte: end }
    };
    if (outletId) query.outletId = new mongoose.Types.ObjectId(outletId);

    const [aggResult] = await Order.aggregate([
      { $match: query },
      {
        $facet: {
          metrics: [
            {
              $group: {
                _id: null,
                totalSales: { $sum: "$total" },
                totalOrders: { $sum: 1 },
                gstCollected: { $sum: { $ifNull: ["$tax", 0] } },
                igstCollected: { $sum: { $ifNull: ["$igst", 0] } },
                cgstCollected: { $sum: { $ifNull: ["$cgst", 0] } },
                sgstCollected: { $sum: { $ifNull: ["$sgst", 0] } },
                creditIssued: { $sum: { $ifNull: ["$amountDue", 0] } },
                wholesaleSales: {
                  $sum: { $cond: [{ $eq: ["$billingMode", "wholesale"] }, "$total", 0] }
                },
                invoicesGenerated: {
                  $sum: {
                    $cond: [
                      { $and: [{ $ne: ["$invoiceNumber", null] }, { $ne: ["$invoiceNumber", ""] }] },
                      1,
                      0
                    ]
                  }
                }
              }
            }
          ],
          paymentSummary: [
            {
              $lookup: {
                from: "payments",
                localField: "_id",
                foreignField: "orderId",
                as: "payments"
              }
            },
            { $unwind: { path: "$payments", preserveNullAndEmptyArrays: false } },
            {
              $group: {
                _id: "$payments.method",
                amount: { $sum: "$payments.amount" }
              }
            }
          ],
          staffSales: [
            {
              $group: {
                _id: "$createdBy",
                revenue: { $sum: "$total" },
                orders: { $sum: 1 }
              }
            },
            {
              $lookup: {
                from: "users",
                localField: "_id",
                foreignField: "_id",
                as: "user"
              }
            },
            { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                name: { $ifNull: ["$user.name", "Unknown/Online"] },
                revenue: 1,
                orders: 1
              }
            },
            { $sort: { revenue: -1 } }
          ],
          bestSelling: [
            { $unwind: "$items" },
            {
              $group: {
                _id: "$items.name",
                qty: { $sum: "$items.qty" },
                total: { $sum: "$items.lineTotal" }
              }
            },
            {
              $project: {
                _id: 0,
                name: "$_id",
                qty: 1,
                total: 1
              }
            },
            { $sort: { qty: -1 } },
            { $limit: 10 }
          ]
        }
      }
    ]);

    const metrics = aggResult?.metrics?.[0] || {};
    const paymentSummaryList = aggResult?.paymentSummary || [];
    
    const paymentSummary = { cash: 0, upi: 0, card: 0, wallet: 0, split: 0 };
    for (const p of paymentSummaryList) {
      if (p._id) paymentSummary[p._id] = p.amount;
    }

    return successResponse({
      res: res,
      data: {
        totalSales: metrics.totalSales || 0,
        totalOrders: metrics.totalOrders || 0,
        paymentSummary,
        bestSelling: aggResult?.bestSelling || [],
        staffSales: aggResult?.staffSales || [],
        gstCollected: metrics.gstCollected || 0,
        wholesaleSales: metrics.wholesaleSales || 0,
        creditIssued: metrics.creditIssued || 0,
        invoicesGenerated: metrics.invoicesGenerated || 0,
        igstCollected: metrics.igstCollected || 0,
        cgstCollected: metrics.cgstCollected || 0,
        sgstCollected: metrics.sgstCollected || 0
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
    const outlets = await Outlet.find({ businessId, isActive: true }).lean();
    
    const query = {
      businessId: new mongoose.Types.ObjectId(businessId),
      status: "completed",
      createdAt: { $gte: start, $lte: end }
    };
    
    const agg = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$outletId",
          revenue: { $sum: "$total" },
          orders: { $sum: 1 }
        }
      }
    ]);
    
    const aggMap = new Map(agg.map(a => [a._id?.toString(), a]));
    
    const result = outlets.map(outlet => {
      const match = aggMap.get(outlet._id.toString()) || { revenue: 0, orders: 0 };
      return { outlet: { id: outlet._id, name: outlet.name }, revenue: match.revenue, orders: match.orders };
    });
    
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
    
    const d = new Date();
    d.setDate(d.getDate() - (numDays - 1));
    d.setHours(0, 0, 0, 0);
    const start = d;
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    
    const query = {
      businessId: new mongoose.Types.ObjectId(businessId),
      status: "completed",
      createdAt: { $gte: start, $lte: end }
    };
    if (outletId) query.outletId = new mongoose.Types.ObjectId(outletId);

    const agg = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$total" },
          orders: { $sum: 1 }
        }
      }
    ]);
    
    const aggMap = new Map(agg.map(a => [a._id, a]));
    
    for (let i = numDays - 1; i >= 0; i--) {
      const iterD = new Date();
      iterD.setDate(iterD.getDate() - i);
      const dateStr = iterD.toISOString().split("T")[0];
      const match = aggMap.get(dateStr) || { revenue: 0, orders: 0 };
      trend.push({ date: dateStr, revenue: match.revenue, orders: match.orders });
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
      businessId: new mongoose.Types.ObjectId(businessId),
      status: "completed",
      createdAt: { $gte: start, $lte: end }
    };
    if (outletId) orderQuery.outletId = new mongoose.Types.ObjectId(outletId);

    const [orderAgg] = await Order.aggregate([
      { $match: orderQuery },
      {
        $group: {
          _id: null,
          totalSalesToday: { $sum: "$total" },
          totalOrdersToday: { $sum: 1 },
          gstCollectedToday: { $sum: { $ifNull: ["$tax", 0] } },
          wholesaleSalesToday: {
            $sum: { $cond: [{ $eq: ["$billingMode", "wholesale"] }, "$total", 0] }
          },
          creditIssuedToday: { $sum: { $ifNull: ["$amountDue", 0] } },
          invoicesToday: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ["$invoiceNumber", null] }, { $ne: ["$invoiceNumber", ""] }] },
                1,
                0
              ]
            }
          },
          igstToday: { $sum: { $ifNull: ["$igst", 0] } },
          cgstSgstToday: { $sum: { $add: [{ $ifNull: ["$cgst", 0] }, { $ifNull: ["$sgst", 0] }] } }
        }
      }
    ]);

    const summary = orderAgg || {
      totalSalesToday: 0,
      totalOrdersToday: 0,
      gstCollectedToday: 0,
      wholesaleSalesToday: 0,
      creditIssuedToday: 0,
      invoicesToday: 0,
      igstToday: 0,
      cgstSgstToday: 0
    };

    return successResponse({
      res,
      data: {
        totalCreditOutstanding: creditAgg[0]?.total || 0,
        customersWithDue,
        totalCustomers: creditAgg[0]?.count || 0,
        totalSalesToday: summary.totalSalesToday || 0,
        totalOrdersToday: summary.totalOrdersToday || 0,
        gstCollectedToday: summary.gstCollectedToday || 0,
        wholesaleSalesToday: summary.wholesaleSalesToday || 0,
        creditIssuedToday: summary.creditIssuedToday || 0,
        invoicesToday: summary.invoicesToday || 0,
        igstToday: summary.igstToday || 0,
        cgstSgstToday: summary.cgstSgstToday || 0
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

const inventoryValuationCache = new Map();

async function getInventoryValuation(businessId, outletId) {
  const cacheKey = `${businessId}-${outletId || "all"}`;
  const cached = inventoryValuationCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.data;
  }

  const [inventories, products] = await Promise.all([
    Inventory.find({ businessId, isActive: true, ...(outletId ? { outletId } : {}) })
      .select("productId onHandQty").lean(),
    Product.find({ businessId })
      .select("_id costPrice price").lean()
  ]);

  const pMap = new Map();
  for (let i = 0; i < products.length; i++) {
    pMap.set(products[i]._id.toString(), products[i]);
  }

  let onHandCostValue = 0;
  let onHandSellValue = 0;
  for (let i = 0; i < inventories.length; i++) {
    const inv = inventories[i];
    if (!inv.productId) continue;
    const p = pMap.get(inv.productId.toString());
    if (p) {
      onHandCostValue += (inv.onHandQty || 0) * (p.costPrice || 0);
      onHandSellValue += (inv.onHandQty || 0) * (p.price || 0);
    }
  }

  const result = { onHandCostValue, onHandSellValue };
  inventoryValuationCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

async function getProfitLedger(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, from, to, page = 1, limit = 50, search } = req.query;
    const query = { businessId: new mongoose.Types.ObjectId(businessId) };
    if (outletId) query.outletId = new mongoose.Types.ObjectId(outletId);
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

    const orderQuery = { businessId, status: "completed" };
    if (outletId) orderQuery.outletId = outletId;
    if (createdAt) orderQuery.createdAt = createdAt;

    const [entries, summaryAgg, valuation, ordersCount] = await Promise.all([
      StockEntry.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("productId", "name unit price costPrice onHandQty packagingUnits")
        .populate("createdBy", "name")
        .lean(),
      StockEntry.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalDocuments: { $sum: 1 },
            stockInvested: { $sum: { $cond: [{ $gt: ["$qty", 0] }, { $ifNull: ["$costValue", 0] }, 0] } },
            potentialMargin: { $sum: { $cond: [{ $gt: ["$qty", 0] }, { $ifNull: ["$expectedProfit", 0] }, 0] } },
            realizedRevenue: { $sum: { $ifNull: ["$realizedRevenue", 0] } },
            realizedCost: { $sum: { $ifNull: ["$realizedCost", 0] } },
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
      getInventoryValuation(businessId, outletId),
      Order.countDocuments(orderQuery)
    ]);

    const raw = summaryAgg[0] || {
      totalDocuments: 0,
      stockInvested: 0,
      potentialMargin: 0,
      spoilageLoss: 0,
      returnLoss: 0,
      replacementCost: 0,
      totalLoss: 0,
      realizedRevenue: 0,
      realizedCost: 0
    };

    const total = raw.totalDocuments || 0;

    const onHandCostValue = valuation.onHandCostValue || 0;
    const onHandSellValue = valuation.onHandSellValue || 0;

    const realizedRevenue = raw.realizedRevenue || 0;
    const realizedCost = raw.realizedCost || 0;
    const realizedGrossProfit = realizedRevenue - realizedCost;

    const summary = {
      ...raw,
      realizedRevenue,
      realizedCost,
      realizedGrossProfit,
      ordersCount,
      netProfit: realizedGrossProfit - raw.totalLoss,
      onHandCostValue,
      onHandSellValue,
      onHandPotentialMargin: onHandSellValue - onHandCostValue
    };

    const movements = entries.map(formatLedgerRow);

    const numLimit = Number(limit);
    const numPage = Number(page);

    const meta = {
      pagination: {
        page: numPage,
        limit: numLimit,
        total,
        totalPages: Math.ceil(total / numLimit) || 1
      }
    };

    return successResponse({
      res,
      data: {
        summary,
        movements,
        total
      },
      meta
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
