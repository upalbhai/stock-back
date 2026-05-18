import type { Response, NextFunction } from "express";
import type { AuthedRequest } from "../middlewares/auth.js";
import { Product } from "../models/Product.js";
import { StockEntry } from "../models/StockEntry.js";
import { AuditLog } from "../models/AuditLog.js";

export async function listProducts(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { businessId } = req.user!;
    const { outletId, categoryId, search, includeInactive } = req.query;
    const query: Record<string, unknown> = { businessId };
    if (outletId) query.outletId = outletId;
    if (categoryId) query.categoryId = categoryId;
    if (!includeInactive) query.isActive = true;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } }
      ];
    }
    const products = await Product.find(query)
      .populate("categoryId", "name icon color parentId")
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    return res.json({ products });
  } catch (error) { return next(error); }
}

export async function getProduct(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { businessId } = req.user!;
    const product = await Product.findOne({ _id: req.params.id, businessId })
      .populate("categoryId", "name icon color parentId").lean();
    if (!product) return res.status(404).json({ message: "Product not found" });
    return res.json({ product });
  } catch (error) { return next(error); }
}

export async function createProduct(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { businessId } = req.user!;
    const { outletId, categoryId, name, description, sku, barcode, unit, price, costPrice,
      taxRate, gstRate, onHandQty, lowStockThreshold, isFeatured, image, tags, sortOrder } = req.body;

    const product = await Product.create({
      businessId, outletId, categoryId, name, description, sku, barcode,
      unit: unit || "pcs", price, costPrice: costPrice || 0, taxRate: taxRate || 0,
      gstRate: gstRate || 0, onHandQty: onHandQty || 0,
      lowStockThreshold: lowStockThreshold || 10, isFeatured: isFeatured || false,
      image, tags: tags || [], sortOrder: sortOrder || 0
    });

    if (onHandQty > 0) {
      await StockEntry.create({
        businessId, outletId, productId: product._id, type: "opening",
        qty: onHandQty, qtyBefore: 0, qtyAfter: onHandQty,
        note: "Opening stock", createdBy: req.user?.userId
      });
    }

    await AuditLog.create({
      businessId, actorId: req.user?.userId, module: "products", action: "create",
      targetType: "Product", targetId: product._id, targetName: product.name,
      message: `Product created: ${product.name}`, ip: req.ip
    });
    return res.status(201).json({ product });
  } catch (error) { return next(error); }
}

export async function updateProduct(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { businessId } = req.user!;
    const allowed = ["name", "description", "categoryId", "sku", "barcode", "unit",
      "price", "costPrice", "taxRate", "gstRate", "lowStockThreshold",
      "isFeatured", "image", "tags", "sortOrder", "isActive"];
    const update: Record<string, unknown> = {};
    for (const key of allowed) { if (req.body[key] !== undefined) update[key] = req.body[key]; }
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, businessId }, { $set: update }, { new: true });
    if (!product) return res.status(404).json({ message: "Product not found" });
    return res.json({ product });
  } catch (error) { return next(error); }
}

export async function deleteProduct(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { businessId } = req.user!;
    await Product.findOneAndUpdate({ _id: req.params.id, businessId }, { $set: { isActive: false } });
    return res.json({ message: "Product deactivated" });
  } catch (error) { return next(error); }
}
