import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Product } from "../models/Product.js";
import { Unit } from "../models/Unit.js";
import { StockEntry } from "../models/StockEntry.js";
import { AuditLog } from "../models/AuditLog.js";
import { assertCanAddProduct } from "../utils/planLimits.js";

async function validatePackagingUnits(businessId, packagingUnits) {
  if (!packagingUnits?.length) return [];
  const validated = [];
  for (const pkg of packagingUnits) {
    const unitDoc = await Unit.findOne({ _id: pkg.unitId, businessId, isActive: true });
    if (!unitDoc) {
      return { error: `Invalid packaging unitId: ${pkg.unitId}` };
    }
    validated.push({
      unitId: pkg.unitId,
      qtyPerUnit: pkg.qtyPerUnit,
      price: pkg.price,
      costPrice: pkg.costPrice ?? 0,
      isActive: pkg.isActive !== false
    });
  }
  return validated;
}

async function listProducts(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, categoryId, search, includeInactive, page = 1, limit = 50, cursor } = req.query;
    
    const query = { businessId };
    if (outletId) query.outletId = outletId;
    if (categoryId) query.categoryId = categoryId;
    if (!includeInactive) query.isActive = true;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
        { barcode: search }
      ];
    }
    
    const numLimit = Number(limit);
    if (cursor) {
      query._id = { $gt: cursor }; // For ascending sort
    }

    const sortOption = { _id: 1 }; // Consistent sorting for cursor

    const products = await Product.find(query)
      .populate("categoryId", "name icon color parentId")
      .populate({ path: "unitId", select: "name abbreviation key" })
      .populate({ path: "packagingUnits.unitId", select: "name abbreviation key" })
      .sort(sortOption)
      .skip(cursor ? 0 : (Number(page) - 1) * numLimit)
      .limit(numLimit)
      .lean();

    let meta = null;
    if (cursor !== undefined) {
      const hasNextPage = products.length === numLimit;
      const nextCursor = hasNextPage ? products[products.length - 1]._id : null;
      meta = { cursor: { nextCursor, hasNextPage } };
    } else {
      const total = await Product.countDocuments(query);
      meta = {
        pagination: {
          page: Number(page),
          limit: numLimit,
          total,
          totalPages: Math.ceil(total / numLimit)
        }
      };
    }

    return successResponse({
      res: res,
      message: "Products fetched successfully",
      data: products,
      meta
    });
  } catch (error) {
    return next(error);
  }
}
async function getProduct(req, res, next) {
  try {
    const { businessId } = req.user;
    const product = await Product.findOne({ _id: req.params.id, businessId })
      .populate("categoryId", "name icon color parentId")
      .populate({ path: "unitId", select: "name abbreviation key" })
      .populate({ path: "packagingUnits.unitId", select: "name abbreviation key" })
      .lean();
    if (!product) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Product not found"
    });
    return successResponse({
      res: res,

      data: {
        product
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function createProduct(req, res, next) {
  try {
    const canAdd = await assertCanAddProduct(req, res);
    if (!canAdd) return;

    const { businessId } = req.user;
    const {
      outletId,
      categoryId,
      name,
      description,
      sku,
      barcode,
      unit,
      unitId,
      price,
      costPrice,
      taxRate,
      gstRate,
      hsnCode,
      packagingUnits,
      onHandQty,
      lowStockThreshold,
      isFeatured,
      image,
      tags,
      sortOrder
    } = req.body;
    // If unitId provided, validate it belongs to this business (or is global i.e. outletId: null)
    if (unitId) {
      const unitDoc = await Unit.findOne({ _id: unitId, businessId });
      if (!unitDoc) {
        // also allow business-global units (outletId null)
        const globalUnit = await Unit.findOne({ _id: unitId, outletId: null });
        if (!globalUnit) return errorResponse({ res, statusCode: 400, message: "Invalid unitId" });
      }
    }

    let validatedPackaging = [];
    if (packagingUnits?.length) {
      const enabled = req.enabledFeatures || [];
      if (!enabled.includes("packaging_units") && req.user?.role !== "superadmin") {
        return errorResponse({
          res,
          statusCode: 403,
          message: "Packaging units not available on your plan"
        });
      }
      const validatedPkgs = await validatePackagingUnits(businessId, packagingUnits);
      if (validatedPkgs.error) {
        return errorResponse({ res, statusCode: 400, message: validatedPkgs.error });
      }
      validatedPackaging = validatedPkgs;
    }

    const product = await Product.create({
      businessId,
      outletId,
      categoryId,
      name,
      description,
      sku,
      barcode,
      unitId: unitId || undefined,
      unit: unit || "pcs",
      price,
      costPrice: costPrice || 0,
      taxRate: taxRate || 0,
      gstRate: gstRate || 0,
      hsnCode: hsnCode || undefined,
      packagingUnits: validatedPackaging,
      onHandQty: onHandQty || 0,
      lowStockThreshold: lowStockThreshold || 10,
      isFeatured: isFeatured || false,
      image,
      tags: tags || [],
      sortOrder: sortOrder || 0
    });
    if (onHandQty > 0) {
      await StockEntry.create({
        businessId,
        outletId,
        productId: product._id,
        type: "opening",
        qty: onHandQty,
        qtyBefore: 0,
        qtyAfter: onHandQty,
        note: "Opening stock",
        createdBy: req.user?.userId
      });
    }
    await AuditLog.create({
      businessId,
      actorId: req.user?.userId,
      module: "products",
      action: "create",
      targetType: "Product",
      targetId: product._id,
      targetName: product.name,
      message: `Product created: ${product.name}`,
      ip: req.ip
    });
    return successResponse({
      res: res,
      statusCode: 201,

      data: {
        product
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function updateProduct(req, res, next) {
  try {
    const { businessId } = req.user;
    const allowed = [
      "name",
      "description",
      "categoryId",
      "sku",
      "barcode",
      "unit",
      "unitId",
      "price",
      "costPrice",
      "taxRate",
      "gstRate",
      "hsnCode",
      "packagingUnits",
      "lowStockThreshold",
      "isFeatured",
      "image",
      "tags",
      "sortOrder",
      "isActive"
    ];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== void 0) update[key] = req.body[key];
    }
    // If updating unitId, validate ownership/global
    if (update.unitId) {
      const unitDoc = await Unit.findOne({ _id: update.unitId, businessId });
      if (!unitDoc) {
        const globalUnit = await Unit.findOne({ _id: update.unitId, outletId: null });
        if (!globalUnit) return errorResponse({ res, statusCode: 400, message: "Invalid unitId" });
      }
    }

    if (update.packagingUnits !== undefined && update.packagingUnits?.length) {
      const enabled = req.enabledFeatures || [];
      if (!enabled.includes("packaging_units") && req.user?.role !== "superadmin") {
        return errorResponse({
          res,
          statusCode: 403,
          message: "Packaging units not available on your plan"
        });
      }
      const validatedPkgs = await validatePackagingUnits(businessId, update.packagingUnits);
      if (validatedPkgs.error) {
        return errorResponse({ res, statusCode: 400, message: validatedPkgs.error });
      }
      update.packagingUnits = validatedPkgs;
    }

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, businessId },
      { $set: update },
      { new: true }
    )
      .populate({ path: "unitId", select: "name abbreviation key" })
      .populate({ path: "packagingUnits.unitId", select: "name abbreviation key" });
    if (!product) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Product not found"
    });
    return successResponse({
      res: res,

      data: {
        product
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function deleteProduct(req, res, next) {
  try {
    const { businessId } = req.user;
    await Product.findOneAndUpdate({ _id: req.params.id, businessId }, { $set: { isActive: false } });
    return successResponse({
      res: res,
      message: "Product deactivated"
    });
  } catch (error) {
    return next(error);
  }
}
export {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct
};
