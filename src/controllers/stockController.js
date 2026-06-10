import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Product } from "../models/Product.js";
import { StockEntry } from "../models/StockEntry.js";
import { StockTransfer } from "../models/StockTransfer.js";
import { AuditLog } from "../models/AuditLog.js";
import { resolveUnitCost, resolveUnitSellPrice, getMovementCount } from "../utils/stockCostUtils.js";
async function getStockSummary(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId } = req.query;
    const query = { businessId, isActive: true };
    if (outletId) query.outletId = outletId;
    const products = await Product.find(query).select("onHandQty lowStockThreshold").lean();
    const totalSkus = products.length;
    const onHandTotal = products.reduce((sum, p) => sum + p.onHandQty, 0);
    const lowStock = products.filter((p) => p.onHandQty <= p.lowStockThreshold).length;
    return successResponse({
      res: res,
      data: { totalSkus, onHandTotal, lowStock }
    });
  } catch (error) {
    return next(error);
  }
}
async function getStockAlerts(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId } = req.query;
    const query = { businessId, isActive: true };
    if (outletId) query.outletId = outletId;
    const products = await Product.find(query).select("name onHandQty lowStockThreshold unit categoryId").populate("categoryId", "name icon").lean();
    const alerts = products.filter((p) => p.onHandQty <= p.lowStockThreshold);
    return successResponse({
      res: res,
      data: alerts
    });
  } catch (error) {
    return next(error);
  }
}
async function buildStockHistoryQuery(businessId, params) {
  const { productId, outletId, type, direction, search, startDate, endDate } = params;
  const query = { businessId };
  if (productId) query.productId = productId;
  if (outletId) query.outletId = outletId;
  if (type) query.type = type;
  if (direction === "in") query.qty = { $gt: 0 };
  if (direction === "out") query.qty = { $lt: 0 };

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      query.createdAt.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  const term = String(search || "").trim();
  if (term) {
    const products = await Product.find({
      businessId,
      $or: [
        { name: { $regex: term, $options: "i" } },
        { sku: { $regex: term, $options: "i" } }
      ]
    }).select("_id").lean();
    const productIds = products.map((p) => p._id);
    const orConditions = [{ note: { $regex: term, $options: "i" } }];
    if (productIds.length) orConditions.unshift({ productId: { $in: productIds } });
    query.$or = orConditions;
  }

  return query;
}

async function getStockHistory(req, res, next) {
  try {
    const { businessId } = req.user;
    const { page = 1, limit = 50, ...filterParams } = req.query;
    const query = await buildStockHistoryQuery(businessId, filterParams);
    const skip = (Number(page) - 1) * Number(limit);

    const [entries, total, summaryAgg] = await Promise.all([
      StockEntry.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("productId", "name unit")
        .populate("packagingUnitId", "name abbreviation")
        .populate("createdBy", "name")
        .lean(),
      StockEntry.countDocuments(query),
      StockEntry.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalInQty: { $sum: { $cond: [{ $gt: ["$qty", 0] }, "$qty", 0] } },
            totalOutQty: { $sum: { $cond: [{ $lt: ["$qty", 0] }, { $abs: "$qty" }, 0] } },
            entriesIn: { $sum: { $cond: [{ $gt: ["$qty", 0] }, 1, 0] } },
            entriesOut: { $sum: { $cond: [{ $lt: ["$qty", 0] }, 1, 0] } },
            totalCostValue: { $sum: { $cond: [{ $gt: ["$qty", 0] }, { $ifNull: ["$costValue", 0] }, 0] } },
            totalSellValue: { $sum: { $cond: [{ $gt: ["$qty", 0] }, { $ifNull: ["$sellValue", 0] }, 0] } },
            totalExpectedProfit: { $sum: { $cond: [{ $gt: ["$qty", 0] }, { $ifNull: ["$expectedProfit", 0] }, 0] } }
          }
        }
      ])
    ]);

    const summary = summaryAgg[0] || {
      totalInQty: 0,
      totalOutQty: 0,
      entriesIn: 0,
      entriesOut: 0,
      totalCostValue: 0,
      totalSellValue: 0,
      totalExpectedProfit: 0
    };

    return successResponse({
      res: res,
      data: {
        entries,
        total,
        summary
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function applyProductPriceUpdate(product, { soldUnitCost, soldUnitPrice, packagingUnitId }) {
  if (soldUnitCost == null && soldUnitPrice == null) return;

  if (!packagingUnitId) {
    const update = {};
    if (soldUnitPrice != null) update.price = soldUnitPrice;
    if (soldUnitCost != null) update.costPrice = soldUnitCost;
    if (Object.keys(update).length) {
      await Product.findByIdAndUpdate(product._id, update);
    }
    return;
  }

  const pkgId = packagingUnitId.toString();
  const packagingUnits = (product.packagingUnits || []).map((pkg) => {
    const plain = pkg.toObject?.() ?? pkg;
    const id = plain.unitId?.toString?.() || String(plain.unitId);
    if (id !== pkgId) return plain;
    return {
      ...plain,
      ...(soldUnitPrice != null ? { price: soldUnitPrice } : {}),
      ...(soldUnitCost != null ? { costPrice: soldUnitCost } : {})
    };
  });
  await Product.findByIdAndUpdate(product._id, { packagingUnits });
}

async function adjustStock(req, res, next) {
  try {
    const { businessId, userId } = req.user;
    const {
      productId,
      outletId,
      qty,
      type,
      note,
      soldQty,
      soldUnit,
      packagingUnitId,
      conversionFactor,
      baseUnit,
      soldUnitCost,
      soldUnitPrice,
      updateProductPrices,
      lossReason
    } = req.body;
    const product = await Product.findOne({ _id: productId, businessId });
    if (!product) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Product not found"
    });
    const qtyBefore = product.onHandQty;
    const entryType = type || "adjustment";
    const qtyDelta = entryType === "adjustment" ? qty - qtyBefore : qty;
    const qtyAfter = entryType === "adjustment" ? qty : qtyBefore + qty;

    const packagingMeta = {};
    if (soldQty != null) packagingMeta.soldQty = soldQty;
    if (soldUnit) packagingMeta.soldUnit = soldUnit;
    if (packagingUnitId) packagingMeta.packagingUnitId = packagingUnitId;
    if (conversionFactor != null) packagingMeta.conversionFactor = conversionFactor;
    if (baseUnit) packagingMeta.baseUnit = baseUnit;

    const priceMeta = {};
    const isStockIn = qtyDelta > 0 && ["purchase", "opening", "transfer_in", "return"].includes(entryType);
    const isLossOut = qtyDelta < 0 && (entryType === "wastage" || lossReason);

    if (isStockIn && (soldUnitCost != null || soldUnitPrice != null)) {
      const count = soldQty != null ? soldQty : Math.abs(qtyDelta);
      const cost = soldUnitCost ?? resolveUnitCost(product, packagingUnitId);
      const sell = soldUnitPrice ?? resolveUnitSellPrice(product, packagingUnitId);
      priceMeta.soldUnitCost = cost;
      priceMeta.soldUnitPrice = sell;
      priceMeta.costValue = count * cost;
      priceMeta.sellValue = count * sell;
      priceMeta.expectedProfit = priceMeta.sellValue - priceMeta.costValue;
    }

    if (isLossOut) {
      const count = getMovementCount({ soldQty, qty: qtyDelta });
      const unitCost = soldUnitCost ?? resolveUnitCost(product, packagingUnitId);
      priceMeta.soldUnitCost = unitCost;
      priceMeta.costLoss = count * unitCost;
      if (lossReason) priceMeta.lossReason = lossReason;
      else if (entryType === "wastage") priceMeta.lossReason = "spoilage";
    }

    await Product.findByIdAndUpdate(productId, { onHandQty: qtyAfter });

    if (updateProductPrices && isStockIn) {
      await applyProductPriceUpdate(product, {
        soldUnitCost: soldUnitCost ?? undefined,
        soldUnitPrice: soldUnitPrice ?? undefined,
        packagingUnitId
      });
    }

    await StockEntry.create({
      businessId,
      outletId,
      productId,
      type: entryType,
      qty: qtyDelta,
      qtyBefore,
      qtyAfter,
      note,
      createdBy: userId,
      ...packagingMeta,
      ...priceMeta
    });
    await AuditLog.create({
      businessId,
      outletId,
      actorId: userId,
      module: "inventory",
      action: "adjust_stock",
      targetType: "Product",
      targetId: product._id,
      targetName: product.name,
      message: `Stock adjusted: ${product.name} ${qtyBefore}\u2192${qtyAfter}`,
      ip: req.ip
    });
    return successResponse({
      res: res,

      data: {
        product: await Product.findById(productId).lean()
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function createTransfer(req, res, next) {
  try {
    const { businessId, userId } = req.user;
    const { fromOutletId, toOutletId, items, note } = req.body;
    const transfer = await StockTransfer.create({
      businessId,
      fromOutletId,
      toOutletId,
      items,
      note,
      requestedBy: userId,
      status: "pending"
    });
    return successResponse({
      res: res,
      statusCode: 201,

      data: {
        transfer
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function approveTransfer(req, res, next) {
  try {
    const { businessId, userId } = req.user;
    const transfer = await StockTransfer.findOne({ _id: req.params.id, businessId });
    if (!transfer) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Transfer not found"
    });
    if (transfer.status !== "pending") return errorResponse({
      res: res,
      statusCode: 400,
      message: "Already processed"
    });
    for (const item of transfer.items) {
      const src = await Product.findOne({ _id: item.productId, outletId: transfer.fromOutletId });
      if (src) {
        const qb = src.onHandQty;
        const qa = qb - item.qty;
        await Product.findByIdAndUpdate(src._id, { $inc: { onHandQty: -item.qty } });
        await StockEntry.create({
          businessId,
          outletId: transfer.fromOutletId,
          productId: item.productId,
          type: "transfer_out",
          qty: -item.qty,
          qtyBefore: qb,
          qtyAfter: qa,
          referenceId: transfer._id,
          referenceType: "StockTransfer",
          createdBy: userId
        });
      }
      const dst = await Product.findOne({ _id: item.productId, outletId: transfer.toOutletId });
      if (dst) {
        const qb = dst.onHandQty;
        const qa = qb + item.qty;
        await Product.findByIdAndUpdate(dst._id, { $inc: { onHandQty: item.qty } });
        await StockEntry.create({
          businessId,
          outletId: transfer.toOutletId,
          productId: item.productId,
          type: "transfer_in",
          qty: item.qty,
          qtyBefore: qb,
          qtyAfter: qa,
          referenceId: transfer._id,
          referenceType: "StockTransfer",
          createdBy: userId
        });
      }
    }
    await StockTransfer.findByIdAndUpdate(transfer._id, {
      status: "completed",
      approvedBy: userId,
      approvedAt: /* @__PURE__ */ new Date(),
      completedAt: /* @__PURE__ */ new Date()
    });
    return successResponse({
      res: res,
      message: "Transfer completed"
    });
  } catch (error) {
    return next(error);
  }
}
async function listTransfers(req, res, next) {
  try {
    const { businessId } = req.user;
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [transfers, total] = await Promise.all([
      StockTransfer.find({ businessId })
        .populate("fromOutletId", "name")
        .populate("toOutletId", "name")
        .populate("requestedBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      StockTransfer.countDocuments({ businessId })
    ]);
    return successResponse({
      res: res,

      data: {
        transfers,
        total
      }
    });
  } catch (error) {
    return next(error);
  }
}
export {
  adjustStock,
  approveTransfer,
  createTransfer,
  getStockAlerts,
  getStockHistory,
  getStockSummary,
  listTransfers
};
