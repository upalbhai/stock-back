import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Product } from "../models/Product.js";
import { Inventory } from "../models/Inventory.js";
import { Unit } from "../models/Unit.js";
import { StockEntry } from "../models/StockEntry.js";
import { AuditLog } from "../models/AuditLog.js";
import { assertCanAddProduct } from "../utils/planLimits.js";
import { withTransaction } from "../utils/transaction.js";
import mongoose from "mongoose";

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
    const { outletId, categoryId, search, scan, includeInactive, page = 1, limit = 50, cursor } = req.query;
    const numLimit = Number(limit);

    const pipeline = [];

    // 1. Initial Match on Inventory
    const inventoryMatch = {
      businessId: new mongoose.Types.ObjectId(businessId),
    };
    if (outletId) {
      inventoryMatch.outletId = new mongoose.Types.ObjectId(outletId);
    }
    if (!includeInactive) {
      inventoryMatch.isActive = true;
    }
    if (cursor) {
      inventoryMatch._id = { $gt: new mongoose.Types.ObjectId(cursor) };
    }
    pipeline.push({ $match: inventoryMatch });

    // 2. Build product match filters
    const productMatch = {
      businessId: new mongoose.Types.ObjectId(businessId)
    };
    
    if (!includeInactive) {
      productMatch.isActive = true;
    }
    if (categoryId) {
      productMatch.categoryId = new mongoose.Types.ObjectId(categoryId);
    }
    
    if (scan) {
      productMatch.$or = [
        { barcode: scan },
        { sku: scan }
      ];
    } else if (search) {
      productMatch.$or = [
        { name: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
        { barcode: search }
      ];
    }

    // 3. Lookup Product and apply filters within the lookup pipeline
    pipeline.push({
      $lookup: {
        from: "products",
        let: { pId: "$productId" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$pId"] } } },
          { $match: productMatch },
          // Nested lookup for Category
          {
            $lookup: {
              from: "categories",
              localField: "categoryId",
              foreignField: "_id",
              as: "categoryId"
            }
          },
          { $unwind: { path: "$categoryId", preserveNullAndEmptyArrays: true } },
          // Nested lookup for Primary Unit
          {
            $lookup: {
              from: "units",
              localField: "unitId",
              foreignField: "_id",
              as: "unitId"
            }
          },
          { $unwind: { path: "$unitId", preserveNullAndEmptyArrays: true } }
        ],
        as: "productId"
      }
    });

    // 4. Unwind the product (if it didn't match filters, it will be empty array, so this drops the inventory record)
    pipeline.push({
      $unwind: { path: "$productId", preserveNullAndEmptyArrays: false }
    });

    // 5. Lookup for packagingUnits.unitId
    pipeline.push({
      $lookup: {
        from: "units",
        localField: "productId.packagingUnits.unitId",
        foreignField: "_id",
        as: "pkgUnitsDocs"
      }
    });

    // 6. Map the pkgUnitsDocs back into the packagingUnits array
    pipeline.push({
      $addFields: {
        "productId.packagingUnits": {
          $map: {
            input: { $ifNull: ["$productId.packagingUnits", []] },
            as: "pu",
            in: {
              $mergeObjects: [
                "$$pu",
                {
                  unitId: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: "$pkgUnitsDocs",
                          as: "pud",
                          cond: { $eq: ["$$pud._id", "$$pu.unitId"] }
                        }
                      },
                      0
                    ]
                  }
                }
              ]
            }
          }
        }
      }
    });
    
    // Clean up temporary docs array
    pipeline.push({
      $project: { pkgUnitsDocs: 0 }
    });

    // 7. Sort and Pagination
    pipeline.push({ $sort: { _id: 1 } });
    if (!cursor) {
      pipeline.push({ $skip: (Number(page) - 1) * numLimit });
    }
    pipeline.push({ $limit: numLimit });

    // 8. Execute the pipeline
    const inventoryDocs = await Inventory.aggregate(pipeline);

    const mergedProducts = inventoryDocs.map(mergeInventoryAndProduct).filter(Boolean);

    // 9. Meta calculation
    let meta = null;
    if (cursor !== undefined) {
      const hasNextPage = mergedProducts.length === numLimit;
      const nextCursor = hasNextPage ? inventoryDocs[inventoryDocs.length - 1]._id : null;
      meta = { cursor: { nextCursor, hasNextPage } };
    } else {
      // Optimize count pipeline to only include what's necessary for filtering
      const countPipeline = [
        { $match: inventoryMatch },
        {
          $lookup: {
            from: "products",
            let: { pId: "$productId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$pId"] } } },
              { $match: productMatch }
            ],
            as: "productId"
          }
        },
        {
          $unwind: { path: "$productId", preserveNullAndEmptyArrays: false }
        },
        { $count: "total" }
      ];
      
      const countResult = await Inventory.aggregate(countPipeline);
      const total = countResult[0] ? countResult[0].total : 0;
      
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

    const numLimit = Number(limit);
    const numPage = Number(page);

    const productMatch = { 
      businessId: new mongoose.Types.ObjectId(businessId), 
      isActive: true 
    };

    if (search) {
      productMatch.$or = [
        { name: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
        { barcode: search }
      ];
    }
    
    if (outletId) {
      const existingInventories = await Inventory.find(
        { outletId: new mongoose.Types.ObjectId(outletId), isActive: true },
        { productId: 1 }
      ).lean();
      
      const existingProductIds = existingInventories.map(inv => inv.productId);
      
      if (existingProductIds.length > 0) {
        productMatch._id = { $nin: existingProductIds };
      }
    }

    const [total, products] = await Promise.all([
      Product.countDocuments(productMatch),
      Product.find(productMatch)
        .populate({
          path: "categoryId",
          select: "name icon color parentId"
        })
        .skip((numPage - 1) * numLimit)
        .limit(numLimit)
        .lean()
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

async function importProductsBulk(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, productIds, importAll } = req.body;

    if (!outletId) return errorResponse({ res, statusCode: 400, message: "outletId is required" });

    let targets = [];
    if (importAll) {
      // Find all active products in the business
      const allProducts = await Product.find({ businessId, isActive: true }).select("_id").lean();
      const allProductIds = allProducts.map(p => p._id.toString());
      
      // Find existing inventories in this outlet
      const existingInventory = await Inventory.find({ businessId, outletId }).select("productId").lean();
      const existingProductIds = new Set(existingInventory.map(i => i.productId.toString()));
      
      // Filter out products that are already in the outlet (we only want ones NOT in the outlet at all)
      targets = allProductIds.filter(id => !existingProductIds.has(id));

      // Also grab inactive inventories in this outlet to reactivate them
      const inactiveInventory = await Inventory.find({ businessId, outletId, isActive: false }).select("productId").lean();
      const inactiveProductIds = inactiveInventory.map(i => i.productId.toString());

      // Combine both lists (new items + inactive items to reactivate)
      targets = [...new Set([...targets, ...inactiveProductIds])];
    } else {
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return errorResponse({ res, statusCode: 400, message: "productIds must be a non-empty array" });
      }
      targets = productIds;
    }

    if (targets.length === 0) {
      return successResponse({ res, message: "No new products to import" });
    }

    // Perform bulk write to insert/update inventories
    const bulkOps = targets.map(productId => ({
      updateOne: {
        filter: { productId, outletId, businessId },
        update: {
          $setOnInsert: {
            onHandQty: 0,
            lowStockThreshold: 10
          },
          $set: {
            isActive: true
          }
        },
        upsert: true
      }
    }));

    await Inventory.bulkWrite(bulkOps);

    await AuditLog.create({
      businessId,
      actorId: req.user?.userId,
      module: "products",
      action: "import",
      targetType: "Product",
      message: `Bulk imported ${targets.length} products to outlet ${outletId}`,
      ip: req.ip
    });

    return successResponse({ res, statusCode: 201, message: `Successfully imported ${targets.length} products` });
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
  importProduct,
  importProductsBulk
};
