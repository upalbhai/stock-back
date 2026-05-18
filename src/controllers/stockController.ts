import type { Response, NextFunction } from "express";
import type { AuthedRequest } from "../middlewares/auth.js";
import { Product } from "../models/Product.js";
import { StockEntry } from "../models/StockEntry.js";
import { StockTransfer } from "../models/StockTransfer.js";
import { AuditLog } from "../models/AuditLog.js";

export async function getStockSummary(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { businessId } = req.user!;
    const { outletId } = req.query;
    const query: Record<string, unknown> = { businessId, isActive: true };
    if (outletId) query.outletId = outletId;
    const products = await Product.find(query).select("onHandQty lowStockThreshold").lean();
    const totalSkus = products.length;
    const onHandTotal = products.reduce((sum, p) => sum + p.onHandQty, 0);
    const lowStock = products.filter(p => p.onHandQty <= p.lowStockThreshold).length;
    return res.json({ data: { totalSkus, onHandTotal, lowStock } });
  } catch (error) { return next(error); }
}

export async function getStockAlerts(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { businessId } = req.user!;
    const { outletId } = req.query;
    const query: Record<string, unknown> = { businessId, isActive: true };
    if (outletId) query.outletId = outletId;
    const products = await Product.find(query)
      .select("name onHandQty lowStockThreshold unit categoryId")
      .populate("categoryId", "name icon").lean();
    const alerts = products.filter(p => p.onHandQty <= p.lowStockThreshold);
    return res.json({ data: alerts });
  } catch (error) { return next(error); }
}

export async function getStockHistory(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { businessId } = req.user!;
    const { productId, outletId, page = 1, limit = 50 } = req.query;
    const query: Record<string, unknown> = { businessId };
    if (productId) query.productId = productId;
    if (outletId) query.outletId = outletId;
    const skip = (Number(page) - 1) * Number(limit);
    const [entries, total] = await Promise.all([
      StockEntry.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
        .populate("productId", "name unit").populate("createdBy", "name").lean(),
      StockEntry.countDocuments(query)
    ]);
    return res.json({ entries, total });
  } catch (error) { return next(error); }
}

export async function adjustStock(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { businessId, userId } = req.user!;
    const { productId, outletId, qty, type, note } = req.body;
    const product = await Product.findOne({ _id: productId, businessId });
    if (!product) return res.status(404).json({ message: "Product not found" });
    const qtyBefore = product.onHandQty;
    const qtyAfter = type === "adjustment" ? qty : qtyBefore + qty;
    await Product.findByIdAndUpdate(productId, { onHandQty: qtyAfter });
    await StockEntry.create({
      businessId, outletId, productId, type: type || "adjustment",
      qty: qtyAfter - qtyBefore, qtyBefore, qtyAfter, note, createdBy: userId
    });
    await AuditLog.create({
      businessId, outletId, actorId: userId, module: "inventory", action: "adjust_stock",
      targetType: "Product", targetId: product._id, targetName: product.name,
      message: `Stock adjusted: ${product.name} ${qtyBefore}→${qtyAfter}`, ip: req.ip
    });
    return res.json({ product: await Product.findById(productId).lean() });
  } catch (error) { return next(error); }
}

export async function createTransfer(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { businessId, userId } = req.user!;
    const { fromOutletId, toOutletId, items, note } = req.body;
    const transfer = await StockTransfer.create({
      businessId, fromOutletId, toOutletId, items, note, requestedBy: userId, status: "pending"
    });
    return res.status(201).json({ transfer });
  } catch (error) { return next(error); }
}

export async function approveTransfer(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { businessId, userId } = req.user!;
    const transfer = await StockTransfer.findOne({ _id: req.params.id, businessId });
    if (!transfer) return res.status(404).json({ message: "Transfer not found" });
    if (transfer.status !== "pending") return res.status(400).json({ message: "Already processed" });
    for (const item of transfer.items) {
      const src = await Product.findOne({ _id: item.productId, outletId: transfer.fromOutletId });
      if (src) {
        const qb = src.onHandQty; const qa = qb - item.qty;
        await Product.findByIdAndUpdate(src._id, { $inc: { onHandQty: -item.qty } });
        await StockEntry.create({ businessId, outletId: transfer.fromOutletId, productId: item.productId,
          type: "transfer_out", qty: -item.qty, qtyBefore: qb, qtyAfter: qa,
          referenceId: transfer._id, referenceType: "StockTransfer", createdBy: userId });
      }
      const dst = await Product.findOne({ _id: item.productId, outletId: transfer.toOutletId });
      if (dst) {
        const qb = dst.onHandQty; const qa = qb + item.qty;
        await Product.findByIdAndUpdate(dst._id, { $inc: { onHandQty: item.qty } });
        await StockEntry.create({ businessId, outletId: transfer.toOutletId, productId: item.productId,
          type: "transfer_in", qty: item.qty, qtyBefore: qb, qtyAfter: qa,
          referenceId: transfer._id, referenceType: "StockTransfer", createdBy: userId });
      }
    }
    await StockTransfer.findByIdAndUpdate(transfer._id, {
      status: "completed", approvedBy: userId, approvedAt: new Date(), completedAt: new Date()
    });
    return res.json({ message: "Transfer completed" });
  } catch (error) { return next(error); }
}

export async function listTransfers(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { businessId } = req.user!;
    const transfers = await StockTransfer.find({ businessId })
      .populate("fromOutletId", "name").populate("toOutletId", "name")
      .populate("requestedBy", "name").sort({ createdAt: -1 }).lean();
    return res.json({ transfers });
  } catch (error) { return next(error); }
}
