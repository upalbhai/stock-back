import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Product } from "../models/Product.js";
import { Inventory } from "../models/Inventory.js";
import { Unit } from "../models/Unit.js";
import { StockEntry } from "../models/StockEntry.js";
import { AuditLog } from "../models/AuditLog.js";
import { assertCanAddProduct } from "../utils/planLimits.js";
import { withTransaction } from "../utils/transaction.js";

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

function mergeInventoryAndProduct(inventory) {
  if (!inventory || !inventory.productId) return null;
  const product = inventory.productId;
  
  if (product.packagingUnits && product.packagingUnits.length > 0) {
    product.packagingUnits.forEach(pkg => {
      pkg.onHandBulkQty = (inventory.onHandQty != null && pkg.qtyPerUnit)
        ? Math.floor(inventory.onHandQty / pkg.qtyPerUnit)
        : 0;
    });
  }

  return {
    ...product,
    inventoryId: inventory._id,
    onHandQty: inventory.onHandQty,
    lowStockThreshold: inventory.lowStockThreshold,
    isActive: inventory.isActive
  };
}

async function listProducts(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, categoryId, search, includeInactive, page = 1, limit = 50, cursor } = req.query;
    
    const productMatch = { businessId, isActive: true };
    let hasProductFilter = false;

    if (categoryId) {
      productMatch.categoryId = categoryId;
      hasProductFilter = true;
    }
    if (search) {
      productMatch.$or = [
        { name: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
        { barcode: search }
      ];
      hasProductFilter = true;
    }
    
    const query = { businessId };
    
    if (hasProductFilter) {
      const matchedProducts = await Product.find(productMatch).select("_id").lean();
      const productIds = matchedProducts.map(p => p._id);
      query.productId = { $in: productIds };
    } else {
      // Optimization: Instead of loading 100k active product IDs, we load the few inactive ones and exclude them
      const inactiveProducts = await Product.find({ businessId, isActive: false }).select("_id").lean();
      if (inactiveProducts.length > 0) {
        query.productId = { $nin: inactiveProducts.map(p => p._id) };
      }
    }

    if (outletId) query.outletId = outletId;
    if (!includeInactive) query.isActive = true;

    const numLimit = Number(limit);
    if (cursor) {
      query._id = { $gt: cursor };
    }

    const sortOption = { _id: 1 };

    const inventoryDocs = await Inventory.find(query)
      .populate({
        path: "productId",
        populate: [
          { path: "categoryId", select: "name icon color parentId" },
          { path: "unitId", select: "name abbreviation key" },
          { path: "packagingUnits.unitId", select: "name abbreviation key" }
        ]
      })
      .sort(sortOption)
      .skip(cursor ? 0 : (Number(page) - 1) * numLimit)
      .limit(numLimit)
      .lean();

    const mergedProducts = inventoryDocs.map(mergeInventoryAndProduct).filter(Boolean);

    let meta = null;
    if (cursor !== undefined) {
      const hasNextPage = mergedProducts.length === numLimit;
      const nextCursor = hasNextPage ? inventoryDocs[inventoryDocs.length - 1]._id : null;
      meta = { cursor: { nextCursor, hasNextPage } };
    } else {
      const total = await Inventory.countDocuments(query);
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
      res,
      message: "Products fetched successfully",
      data: mergedProducts,
      meta
    });
  } catch (error) {
    return next(error);
  }
}

async function getProduct(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId } = req.query;

    const inventory = await Inventory.findOne({ productId: req.params.id, businessId, outletId })
      .populate({
        path: "productId",
        populate: [
          { path: "categoryId", select: "name icon color parentId" },
          { path: "unitId", select: "name abbreviation key" },
          { path: "packagingUnits.unitId", select: "name abbreviation key" }
        ]
      })
      .lean();

    if (!inventory) return errorResponse({ res, statusCode: 404, message: "Product not found in this outlet" });

    return successResponse({
      res,
      data: {
        product: mergeInventoryAndProduct(inventory)
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function createProduct(req, res, next) {
  try {
    return await withTransaction(async (session) => {
      const canAdd = await assertCanAddProduct(req, res);
      if (!canAdd) return;

      const { businessId } = req.user;
      const {
        outletId, categoryId, name, description, sku, barcode, unit, unitId, price, costPrice, taxRate, gstRate, hsnCode, packagingUnits, onHandQty, lowStockThreshold, isFeatured, image, tags, sortOrder
      } = req.body;

      if (unitId) {
        const unitDoc = await Unit.findOne({ _id: unitId, businessId }).session(session);
        if (!unitDoc) {
          const globalUnit = await Unit.findOne({ _id: unitId, outletId: null }).session(session);
          if (!globalUnit) return errorResponse({ res, statusCode: 400, message: "Invalid unitId" });
        }
      }

      let validatedPackaging = [];
      if (packagingUnits?.length) {
        const enabled = req.enabledFeatures || [];
        if (!enabled.includes("packaging_units") && req.user?.role !== "superadmin") {
          return errorResponse({ res, statusCode: 403, message: "Packaging units not available on your plan" });
        }
        const validatedPkgs = await validatePackagingUnits(businessId, packagingUnits);
        if (validatedPkgs.error) return errorResponse({ res, statusCode: 400, message: validatedPkgs.error });
        validatedPackaging = validatedPkgs;
      }

      const product = await new Product({
        businessId, categoryId, name, description, sku, barcode, unitId: unitId || undefined, unit: unit || "pcs", price, costPrice: costPrice || 0, taxRate: taxRate || 0, gstRate: gstRate || 0, hsnCode: hsnCode || undefined, packagingUnits: validatedPackaging, isFeatured: isFeatured || false, image, tags: tags || [], sortOrder: sortOrder || 0
      }).save({ session });
      
      const inventory = await new Inventory({
        businessId,
        outletId,
        productId: product._id,
        onHandQty: onHandQty || 0,
        lowStockThreshold: lowStockThreshold || 10
      }).save({ session });
      
      if (onHandQty > 0) {
        await new StockEntry({
          businessId, outletId, productId: product._id, type: "opening", qty: onHandQty, qtyBefore: 0, qtyAfter: onHandQty, note: "Opening stock", createdBy: req.user?.userId
        }).save({ session });
      }
      
      await new AuditLog({
        businessId, actorId: req.user?.userId, module: "products", action: "create", targetType: "Product", targetId: product._id, targetName: product.name, message: `Product created: ${product.name}`, ip: req.ip
      }).save({ session });
      
      return successResponse({ res, statusCode: 201, data: { product: mergeInventoryAndProduct({ ...inventory.toObject(), productId: product.toObject() }) } });
    });
  } catch (error) {
    return next(error);
  }
}

async function updateProduct(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId } = req.query; // If provided, update inventory specifics too
    const allowed = ["name", "description", "categoryId", "sku", "barcode", "unit", "unitId", "price", "costPrice", "taxRate", "gstRate", "hsnCode", "packagingUnits", "isFeatured", "image", "tags", "sortOrder", "isActive"];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== void 0) update[key] = req.body[key];
    }
    
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
        return errorResponse({ res, statusCode: 403, message: "Packaging units not available on your plan" });
      }
      const validatedPkgs = await validatePackagingUnits(businessId, update.packagingUnits);
      if (validatedPkgs.error) return errorResponse({ res, statusCode: 400, message: validatedPkgs.error });
      update.packagingUnits = validatedPkgs;
    }

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, businessId },
      { $set: update },
      { new: true }
    )
      .populate({ path: "unitId", select: "name abbreviation key" })
      .populate({ path: "packagingUnits.unitId", select: "name abbreviation key" })
      .lean();
      
    if (!product) return errorResponse({ res, statusCode: 404, message: "Product not found" });

    // Update inventory if outlet specific fields provided
    let inventory = null;
    if (outletId) {
       const invUpdate = {};
       if (req.body.lowStockThreshold !== undefined) invUpdate.lowStockThreshold = req.body.lowStockThreshold;
       if (req.body.isActive !== undefined) invUpdate.isActive = req.body.isActive;
       
       if (Object.keys(invUpdate).length > 0) {
         inventory = await Inventory.findOneAndUpdate(
           { productId: req.params.id, businessId, outletId },
           { $set: invUpdate },
           { new: true }
         ).lean();
       } else {
         inventory = await Inventory.findOne({ productId: req.params.id, businessId, outletId }).lean();
       }
    }

    return successResponse({ res, data: { product: inventory ? mergeInventoryAndProduct({ ...inventory, productId: product }) : product } });
  } catch (error) {
    return next(error);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId } = req.query;
    
    if (outletId) {
      await Inventory.findOneAndUpdate({ productId: req.params.id, businessId, outletId }, { $set: { isActive: false } });
    } else {
      await Product.findOneAndUpdate({ _id: req.params.id, businessId }, { $set: { isActive: false } });
    }
    
    return successResponse({ res, message: "Product deactivated" });
  } catch (error) {
    return next(error);
  }
}

async function getGlobalProducts(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, search, page = 1, limit = 50 } = req.query; // outletId is the current outlet, so we can exclude products already in this outlet

    const query = { businessId, isActive: true };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
        { barcode: search }
      ];
    }
    
    let existingProductIds = [];
    if (outletId) {
      const existingInventory = await Inventory.find({ businessId, outletId, isActive: true }).select("productId").lean();
      existingProductIds = existingInventory.map(i => i.productId);
    }
    
    // Find products not currently in the outlet
    if (existingProductIds.length > 0) {
       query._id = { $nin: existingProductIds };
    }

    const numLimit = Number(limit);
    const numPage = Number(page);

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate("categoryId", "name icon color parentId")
        .skip((numPage - 1) * numLimit)
        .limit(numLimit)
        .lean(),
      Product.countDocuments(query)
    ]);

    const meta = {
      pagination: {
        page: numPage,
        limit: numLimit,
        total,
        totalPages: Math.ceil(total / numLimit)
      }
    };

    return successResponse({ res, message: "Global products fetched", data: products, meta });
  } catch (error) {
    return next(error);
  }
}

async function importProduct(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId } = req.body;
    const productId = req.params.id;

    if (!outletId) return errorResponse({ res, statusCode: 400, message: "outletId is required" });

    const product = await Product.findOne({ _id: productId, businessId });
    if (!product) return errorResponse({ res, statusCode: 404, message: "Product not found in business catalog" });

    // Check if already exists
    let inventory = await Inventory.findOne({ productId, outletId, businessId });
    if (inventory) {
      if (!inventory.isActive) {
        inventory.isActive = true;
        await inventory.save();
      }
    } else {
      inventory = await new Inventory({
        businessId,
        outletId,
        productId,
        onHandQty: 0,
        lowStockThreshold: 10
      }).save();
    }

    return successResponse({ res, statusCode: 201, message: "Product imported successfully", data: { inventory } });
  } catch (error) {
    return next(error);
  }
}

export {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
  getGlobalProducts,
  importProduct
};
