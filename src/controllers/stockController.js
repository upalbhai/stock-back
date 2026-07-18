import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Product } from "../models/Product.js";
import { Inventory } from "../models/Inventory.js";
import { StockEntry } from "../models/StockEntry.js";
import { StockTransfer } from "../models/StockTransfer.js";
import { AuditLog } from "../models/AuditLog.js";
import { resolveUnitCost, resolveUnitSellPrice, getMovementCount } from "../utils/stockCostUtils.js";
import { withTransaction } from "../utils/transaction.js";

import mongoose from "mongoose";

async function getStockSummary(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId } = req.query;
    
    const match = { businessId: new mongoose.Types.ObjectId(businessId), isActive: true };
    if (outletId) match.outletId = new mongoose.Types.ObjectId(outletId);
    
    const [result] = await Inventory.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalSkus: { $sum: 1 },
          onHandTotal: { $sum: { $ifNull: ["$onHandQty", 0] } },
          lowStock: {
            $sum: {
              $cond: [
                { $lte: [{ $ifNull: ["$onHandQty", 0] }, { $ifNull: ["$lowStockThreshold", 10] }] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const data = result || { totalSkus: 0, onHandTotal: 0, lowStock: 0 };
    delete data._id;

    return successResponse({
      res: res,
      data
    });
  } catch (error) {
    return next(error);
  }
}

async function getStockAlerts(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId } = req.query;
    
    const query = { 
      businessId, 
      isActive: true,
      $expr: { $lte: [{ $ifNull: ["$onHandQty", 0] }, { $ifNull: ["$lowStockThreshold", 10] }] }
    };
    
    if (outletId) query.outletId = outletId;
    
    const inventory = await Inventory.find(query)
      .populate({
        path: "productId",
        select: "name unit categoryId",
        populate: { path: "categoryId", select: "name icon" }
      })
      .lean();
      
    // Format to match old shape
    const products = inventory
      .filter(i => i.productId != null)
      .map(i => ({
        _id: i.productId._id,
        name: i.productId.name,
        unit: i.productId.unit,
        categoryId: i.productId.categoryId,
        onHandQty: i.onHandQty,
        lowStockThreshold: i.lowStockThreshold
      }));

    return successResponse({
      res: res,
      data: products
    });
  } catch (error) {
    return next(error);
  }
}

async function buildStockHistoryQuery(businessId, params) {
  const { productId, outletId, type, direction, search, startDate, endDate } = params;
  const query = { businessId: new mongoose.Types.ObjectId(businessId) };
  if (productId) query.productId = new mongoose.Types.ObjectId(productId);
  if (outletId) query.outletId = new mongoose.Types.ObjectId(outletId);
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

    const [entries, summaryAgg] = await Promise.all([
      StockEntry.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("productId", "name unit")
        .populate("packagingUnitId", "name abbreviation")
        .populate("createdBy", "name")
        .lean(),
      StockEntry.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalDocuments: { $sum: 1 },
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
      totalDocuments: 0,
      totalInQty: 0,
      totalOutQty: 0,
      entriesIn: 0,
      entriesOut: 0,
      totalCostValue: 0,
      totalSellValue: 0,
      totalExpectedProfit: 0
    };

    const total = summary.totalDocuments || 0;
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
      res: res,
      data: {
        entries,
        total,
        summary
      },
      meta
    });
  } catch (error) {
    return next(error);
  }
}

async function applyProductPriceUpdate(product, { soldUnitCost, soldUnitPrice, packagingUnitId, session }) {
  if (soldUnitCost == null && soldUnitPrice == null) return;

  if (!packagingUnitId) {
    const update = {};
    if (soldUnitPrice != null) update.price = soldUnitPrice;
    if (soldUnitCost != null) update.costPrice = soldUnitCost;
    if (Object.keys(update).length) {
      await Product.findByIdAndUpdate(product._id, update, { session });
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
  await Product.findByIdAndUpdate(product._id, { packagingUnits }, { session });
}

async function adjustStock(req, res, next) {
  try {
    return await withTransaction(async (session) => {
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
      const product = await Product.findOne({ _id: productId, businessId }).session(session);
      if (!product) return errorResponse({ res: res, statusCode: 404, message: "Product not found" });
      
      const inventory = await Inventory.findOne({ productId, outletId, businessId }).session(session);
      if (!inventory) return errorResponse({ res: res, statusCode: 404, message: "Inventory record not found" });

      const qtyBefore = inventory.onHandQty;
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

      await Inventory.findByIdAndUpdate(inventory._id, { onHandQty: qtyAfter }, { session });

      if (updateProductPrices && isStockIn) {
        await applyProductPriceUpdate(product, {
          soldUnitCost: soldUnitCost ?? undefined,
          soldUnitPrice: soldUnitPrice ?? undefined,
          packagingUnitId,
          session
        });
      }

      await new StockEntry({
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
      }).save({ session });
      
      await new AuditLog({
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
      }).save({ session });
      
      return successResponse({
        res: res,
        data: {
          product: { ...(await Product.findById(productId).session(session).lean()), onHandQty: qtyAfter }
        }
      });
    });
  } catch (error) {
    return next(error);
  }
}

async function createTransfer(req, res, next) {
  try {
    return await withTransaction(async (session) => {
      const { businessId, userId } = req.user;
      const { fromOutletId, toOutletId, items, note } = req.body;
      const transfer = await new StockTransfer({
        businessId,
        fromOutletId,
        toOutletId,
        items,
        note,
        requestedBy: userId,
        status: "pending"
      }).save({ session });
      return successResponse({
        res: res,
        statusCode: 201,
        data: { transfer }
      });
    });
  } catch (error) {
    return next(error);
  }
}

async function approveTransfer(req, res, next) {
  try {
    return await withTransaction(async (session) => {
      const { businessId, userId } = req.user;
      const transfer = await StockTransfer.findOne({ _id: req.params.id, businessId }).session(session);
      if (!transfer) return errorResponse({ res: res, statusCode: 404, message: "Transfer not found" });
      if (transfer.status !== "pending") return errorResponse({ res: res, statusCode: 400, message: "Already processed" });
      
      for (const item of transfer.items) {
        const src = await Inventory.findOne({ productId: item.productId, outletId: transfer.fromOutletId }).session(session);
        if (src) {
          const qb = src.onHandQty;
          const qa = qb - item.qty;
          await Inventory.findByIdAndUpdate(src._id, { $inc: { onHandQty: -item.qty } }, { session });
          await new StockEntry({
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
          }).save({ session });
        }
        
        let dst = await Inventory.findOne({ productId: item.productId, outletId: transfer.toOutletId }).session(session);
        if (dst) {
          const qb = dst.onHandQty;
          const qa = qb + item.qty;
          await Inventory.findByIdAndUpdate(dst._id, { $inc: { onHandQty: item.qty } }, { session });
          await new StockEntry({
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
          }).save({ session });
        } else {
          // If dst doesn't have the product, import it
          await new Inventory({
            businessId, outletId: transfer.toOutletId, productId: item.productId, onHandQty: item.qty, lowStockThreshold: 10
          }).save({ session });
          await new StockEntry({
            businessId, outletId: transfer.toOutletId, productId: item.productId, type: "transfer_in", qty: item.qty, qtyBefore: 0, qtyAfter: item.qty, referenceId: transfer._id, referenceType: "StockTransfer", createdBy: userId
          }).save({ session });
        }
      }
      await StockTransfer.findByIdAndUpdate(transfer._id, {
        status: "completed",
        approvedBy: userId,
        approvedAt: new Date(),
        completedAt: new Date()
      }, { session });
      return successResponse({ res: res, message: "Transfer completed" });
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
    return successResponse({ res: res, data: { transfers, total } });
  } catch (error) {
    return next(error);
  }
}

async function updateStockEntry(req, res, next) {
  try {
    return await withTransaction(async (session) => {
      const { businessId, userId } = req.user;
      const { qty, lossReason, note } = req.body;
      const entry = await StockEntry.findOne({ _id: req.params.id, businessId }).session(session);
      if (!entry) return errorResponse({ res, statusCode: 404, message: "Entry not found" });

      if (!["wastage", "adjustment"].includes(entry.type)) {
        return errorResponse({ res, statusCode: 400, message: "Only manual stock adjustments can be edited" });
      }

      const product = await Product.findOne({ _id: entry.productId, businessId }).session(session);
      if (!product) return errorResponse({ res, statusCode: 404, message: "Product not found" });

      const inventory = await Inventory.findOne({ productId: entry.productId, outletId: entry.outletId, businessId }).session(session);
      if (!inventory) return errorResponse({ res, statusCode: 404, message: "Inventory record not found" });

      const qtyBefore = entry.qty;
      const qtyDelta = qty - qtyBefore;
      const newOnHand = inventory.onHandQty + qtyDelta;

      const isLoss = qty < 0;
      const unitCost = entry.soldUnitCost || resolveUnitCost(product, entry.packagingUnitId);
      const count = getMovementCount({ soldQty: req.body.soldQty ?? entry.soldQty, qty });
      
      const costLoss = isLoss ? count * unitCost : 0;
      const expectedProfit = (!isLoss && (entry.soldUnitPrice != null)) ? (count * entry.soldUnitPrice) - (count * unitCost) : 0;

      await Inventory.findByIdAndUpdate(inventory._id, { onHandQty: newOnHand }, { session });

      entry.qty = qty;
      entry.qtyAfter = entry.qtyBefore + qty;
      if (lossReason !== undefined) entry.lossReason = lossReason;
      if (note !== undefined) entry.note = note;
      entry.costLoss = costLoss;
      if (!isLoss) entry.expectedProfit = expectedProfit;

      await entry.save({ session });

      await new AuditLog({
        businessId, actorId: userId, module: "inventory", action: "update_stock_entry", targetType: "StockEntry", targetId: entry._id, message: `Stock entry edited. Qty changed from ${qtyBefore} to ${qty}. Product on-hand: ${newOnHand}`, ip: req.ip
      }).save({ session });

      return successResponse({ res, message: "Stock entry updated successfully" });
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteStockEntry(req, res, next) {
  try {
    return await withTransaction(async (session) => {
      const { businessId, userId } = req.user;
      const entry = await StockEntry.findOne({ _id: req.params.id, businessId }).session(session);
      if (!entry) return errorResponse({ res, statusCode: 404, message: "Entry not found" });

      if (entry.referenceType || !["purchase", "opening", "wastage", "adjustment", "return"].includes(entry.type)) {
        return errorResponse({ res, statusCode: 400, message: "Only manual stock entries can be deleted" });
      }

      const inventory = await Inventory.findOne({ productId: entry.productId, outletId: entry.outletId, businessId }).session(session);
      if (inventory) {
        const newOnHand = inventory.onHandQty - entry.qty;
        await Inventory.findByIdAndUpdate(inventory._id, { onHandQty: newOnHand }, { session });
        
        await new AuditLog({
          businessId, actorId: userId, module: "inventory", action: "delete_stock_entry", targetType: "StockEntry", targetId: entry._id, message: `Stock entry deleted. Reverted qty ${entry.qty}. Product on-hand: ${newOnHand}`, ip: req.ip
        }).save({ session });
      }

      await StockEntry.deleteOne({ _id: entry._id }, { session });

      return successResponse({ res, message: "Stock entry deleted successfully" });
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
  listTransfers,
  updateStockEntry,
  deleteStockEntry
};
