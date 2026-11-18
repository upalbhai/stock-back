import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Product } from "../models/Product.js";
import { Inventory } from "../models/Inventory.js";
import { Unit } from "../models/Unit.js";
import { StockEntry } from "../models/StockEntry.js";
import { AuditLog } from "../models/AuditLog.js";
import { assertCanAddProduct } from "../utils/planLimits.js";
import { withTransaction } from "../utils/transaction.js";
import { emitToBusiness } from "../utils/socketEmitter.js";
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
    const { outletId, categoryId, brandId, search, scan, includeInactive, page = 1, limit = 50, cursor } = req.query;
    const numLimit = Math.min(Number(limit) || 50, 200);
    const bizOid = new mongoose.Types.ObjectId(businessId);

    // ── Build product-level match conditions ───────────────────────
    const productMatch = { businessId: bizOid };
    if (!includeInactive) productMatch.isActive = true;

    let categoryIds = [];
    if (categoryId) {
      categoryIds = (Array.isArray(categoryId) ? categoryId : categoryId.split(","))
        .map(id => id.trim()).filter(Boolean);
      if (categoryIds.length === 1) {
        productMatch.categoryId = new mongoose.Types.ObjectId(categoryIds[0]);
      } else if (categoryIds.length > 1) {
        productMatch.categoryId = { $in: categoryIds.map(id => new mongoose.Types.ObjectId(id)) };
      }
    }
    if (brandId) {
      productMatch.brandId = new mongoose.Types.ObjectId(brandId);
    }
    if (scan) {
      productMatch.$or = [{ barcode: scan }, { sku: scan }];
    } else if (search) {
      // Detect barcode-like input: all digits & 8+ chars (EAN-8/13, UPC-A/E)
      // → skip expensive regex, use indexed exact match on barcode + sku
      const isBarcodeLike = /^\d{8,}$/.test(search);
      if (isBarcodeLike) {
        productMatch.$or = [{ barcode: search }, { sku: search }];
      } else {
        productMatch.$or = [
          { name: { $regex: search, $options: "i" } },
          { sku: { $regex: search, $options: "i" } },
          { barcode: search }
        ];
      }
    }

    const hasProductFilter = !!(categoryIds.length || brandId || scan || search);

    // ── Build inventory-level match conditions ─────────────────────
    const inventoryMatch = { businessId: bizOid };
    if (outletId) inventoryMatch.outletId = new mongoose.Types.ObjectId(outletId);
    if (!includeInactive) inventoryMatch.isActive = true;

    // ── Helper: run aggregation pipeline starting from Product ─────
    // Used when product-level filters exist so MongoDB filters server-side
    // instead of loading all matching IDs into JS memory.
    async function productLeadPipeline(paginationStages) {
      const pipeline = [
        // Stage 1: Filter products (uses compound index: businessId + categoryId etc.)
        { $match: productMatch },
        // Stage 2: Join inventory for this outlet/business
        {
          $lookup: {
            from: "inventories",
            let: { pid: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$productId", "$$pid"] },
                  ...inventoryMatch
                }
              },
              { $limit: 1 }
            ],
            as: "_inv"
          }
        },
        // Stage 3: Only keep products that have inventory in the target outlet
        { $match: { "_inv.0": { $exists: true } } },
        // Flatten the inventory array to a single object
        { $addFields: { _inv: { $arrayElemAt: ["$_inv", 0] } } },
        // Apply pagination stages (sort, skip/limit or cursor)
        ...paginationStages,
        // Stage 4: Populate category
        {
          $lookup: {
            from: "categories",
            localField: "categoryId",
            foreignField: "_id",
            pipeline: [{ $project: { name: 1, icon: 1, color: 1, parentId: 1 } }],
            as: "_cat"
          }
        },
        // Stage 5: Populate brand
        {
          $lookup: {
            from: "brands",
            localField: "brandId",
            foreignField: "_id",
            pipeline: [{ $project: { name: 1, logo: 1, slug: 1 } }],
            as: "_brand"
          }
        },
        // Stage 6: Populate unit
        {
          $lookup: {
            from: "units",
            localField: "unitId",
            foreignField: "_id",
            pipeline: [{ $project: { name: 1, abbreviation: 1, key: 1 } }],
            as: "_unit"
          }
        },
        // Final shape
        {
          $addFields: {
            categoryId: { $arrayElemAt: ["$_cat", 0] },
            brandId: { $arrayElemAt: ["$_brand", 0] },
            unitId: { $arrayElemAt: ["$_unit", 0] },
            inventoryId: "$_inv._id",
            onHandQty: "$_inv.onHandQty",
            lowStockThreshold: "$_inv.lowStockThreshold"
          }
        },
        { $project: { _inv: 0, _cat: 0, _brand: 0, _unit: 0 } }
      ];

      return Product.aggregate(pipeline).allowDiskUse(true);
    }

    // ── Helper: run aggregation pipeline starting from Inventory ────
    // Used when NO product filter exists — inventory is the smaller scan.
    async function inventoryLeadPipeline(paginationStages) {
      const pipeline = [
        { $match: inventoryMatch },
        ...paginationStages,
        // Join the product document
        {
          $lookup: {
            from: "products",
            localField: "productId",
            foreignField: "_id",
            pipeline: [
              { $match: { businessId: bizOid, ...(!includeInactive ? { isActive: true } : {}) } },
              // Inline populate category, brand, unit via nested $lookup
              {
                $lookup: {
                  from: "categories",
                  localField: "categoryId",
                  foreignField: "_id",
                  pipeline: [{ $project: { name: 1, icon: 1, color: 1, parentId: 1 } }],
                  as: "categoryId"
                }
              },
              {
                $lookup: {
                  from: "brands",
                  localField: "brandId",
                  foreignField: "_id",
                  pipeline: [{ $project: { name: 1, logo: 1, slug: 1 } }],
                  as: "brandId"
                }
              },
              {
                $lookup: {
                  from: "units",
                  localField: "unitId",
                  foreignField: "_id",
                  pipeline: [{ $project: { name: 1, abbreviation: 1, key: 1 } }],
                  as: "unitId"
                }
              },
              {
                $addFields: {
                  categoryId: { $arrayElemAt: ["$categoryId", 0] },
                  brandId: { $arrayElemAt: ["$brandId", 0] },
                  unitId: { $arrayElemAt: ["$unitId", 0] }
                }
              }
            ],
            as: "_product"
          }
        },
        { $match: { "_product.0": { $exists: true } } },
        {
          $addFields: {
            _p: { $arrayElemAt: ["$_product", 0] }
          }
        },
        // Reshape to expected format
        {
          $replaceRoot: {
            newRoot: {
              $mergeObjects: [
                "$_p",
                {
                  inventoryId: "$_id",
                  onHandQty: "$onHandQty",
                  lowStockThreshold: "$lowStockThreshold",
                  isActive: "$isActive"
                }
              ]
            }
          }
        }
      ];

      return Inventory.aggregate(pipeline).allowDiskUse(true);
    }

    let meta = null;

    if (cursor !== undefined) {
      // ── CURSOR-BASED PAGINATION ──────────────────────────────────
      const cursorMatch = cursor ? { _id: { $gt: new mongoose.Types.ObjectId(cursor) } } : {};

      let results;
      if (hasProductFilter) {
        // Product-lead: sort by product _id for stable cursor
        const paginationStages = [
          ...(cursor ? [{ $match: { _id: { $gt: new mongoose.Types.ObjectId(cursor) } } }] : []),
          { $sort: { _id: 1 } },
          { $limit: numLimit }
        ];
        results = await productLeadPipeline(paginationStages);
      } else {
        // Inventory-lead
        const invCursorMatch = { ...inventoryMatch };
        if (cursor) invCursorMatch._id = { $gt: new mongoose.Types.ObjectId(cursor) };
        const paginationStages = [
          { $sort: { _id: 1 } },
          { $limit: numLimit }
        ];
        // Override the $match at the top
        results = await (async () => {
          const pipeline = [
            { $match: invCursorMatch },
            ...paginationStages,
            // same $lookup as inventoryLeadPipeline but inlined for cursor match
            {
              $lookup: {
                from: "products",
                localField: "productId",
                foreignField: "_id",
                pipeline: [
                  { $match: { businessId: bizOid, ...(!includeInactive ? { isActive: true } : {}) } },
                  {
                    $lookup: {
                      from: "categories", localField: "categoryId", foreignField: "_id",
                      pipeline: [{ $project: { name: 1, icon: 1, color: 1, parentId: 1 } }], as: "categoryId"
                    }
                  },
                  {
                    $lookup: {
                      from: "brands", localField: "brandId", foreignField: "_id",
                      pipeline: [{ $project: { name: 1, logo: 1, slug: 1 } }], as: "brandId"
                    }
                  },
                  {
                    $lookup: {
                      from: "units", localField: "unitId", foreignField: "_id",
                      pipeline: [{ $project: { name: 1, abbreviation: 1, key: 1 } }], as: "unitId"
                    }
                  },
                  {
                    $addFields: {
                      categoryId: { $arrayElemAt: ["$categoryId", 0] },
                      brandId: { $arrayElemAt: ["$brandId", 0] },
                      unitId: { $arrayElemAt: ["$unitId", 0] }
                    }
                  }
                ],
                as: "_product"
              }
            },
            { $match: { "_product.0": { $exists: true } } },
            { $addFields: { _p: { $arrayElemAt: ["$_product", 0] } } },
            {
              $replaceRoot: {
                newRoot: {
                  $mergeObjects: ["$_p", {
                    inventoryId: "$_id",
                    onHandQty: "$onHandQty",
                    lowStockThreshold: "$lowStockThreshold",
                    isActive: "$isActive"
                  }]
                }
              }
            }
          ];
          return Inventory.aggregate(pipeline).allowDiskUse(true);
        })();
      }

      // Apply packagingUnits bulk qty calculation
      for (const product of results) {
        if (product.packagingUnits?.length) {
          for (const pkg of product.packagingUnits) {
            pkg.onHandBulkQty = (product.onHandQty != null && pkg.qtyPerUnit)
              ? Math.floor(product.onHandQty / pkg.qtyPerUnit) : 0;
          }
        }
      }

      const hasNextPage = results.length === numLimit;
      const nextCursor = hasNextPage
        ? (results[results.length - 1].inventoryId || results[results.length - 1]._id)
        : null;
      meta = { cursor: { nextCursor, hasNextPage } };

      return successResponse({ res, message: "Products fetched successfully", data: results, meta });

    } else {
      // ── PAGE-BASED PAGINATION ────────────────────────────────────
      const skip = (Number(page) - 1) * numLimit;
      let results, total;

      if (hasProductFilter) {
        // Use $facet for parallel count + data in a single aggregation
        const facetPipeline = [
          { $match: productMatch },
          {
            $lookup: {
              from: "inventories",
              let: { pid: "$_id" },
              pipeline: [
                { $match: { $expr: { $eq: ["$productId", "$$pid"] }, ...inventoryMatch } },
                { $limit: 1 }
              ],
              as: "_inv"
            }
          },
          { $match: { "_inv.0": { $exists: true } } },
          { $addFields: { _inv: { $arrayElemAt: ["$_inv", 0] } } },
          {
            $facet: {
              metadata: [{ $count: "total" }],
              data: [
                { $sort: { _id: 1 } },
                { $skip: skip },
                { $limit: numLimit },
                // Populate category
                {
                  $lookup: {
                    from: "categories", localField: "categoryId", foreignField: "_id",
                    pipeline: [{ $project: { name: 1, icon: 1, color: 1, parentId: 1 } }], as: "_cat"
                  }
                },
                // Populate brand
                {
                  $lookup: {
                    from: "brands", localField: "brandId", foreignField: "_id",
                    pipeline: [{ $project: { name: 1, logo: 1, slug: 1 } }], as: "_brand"
                  }
                },
                // Populate unit
                {
                  $lookup: {
                    from: "units", localField: "unitId", foreignField: "_id",
                    pipeline: [{ $project: { name: 1, abbreviation: 1, key: 1 } }], as: "_unit"
                  }
                },
                {
                  $addFields: {
                    categoryId: { $arrayElemAt: ["$_cat", 0] },
                    brandId: { $arrayElemAt: ["$_brand", 0] },
                    unitId: { $arrayElemAt: ["$_unit", 0] },
                    inventoryId: "$_inv._id",
                    onHandQty: "$_inv.onHandQty",
                    lowStockThreshold: "$_inv.lowStockThreshold"
                  }
                },
                { $project: {
                  _inv: 0, _cat: 0, _brand: 0, _unit: 0,
                  // Strip fields not needed in list/billing view (only for edit/detail)
                  description: 0, hsnCode: 0, sortOrder: 0, tags: 0,
                  __v: 0, businessId: 0, updatedAt: 0, createdAt: 0
                } }
              ]
            }
          }
        ];

        const [facetResult] = await Product.aggregate(facetPipeline).allowDiskUse(true);
        total = facetResult.metadata[0]?.total ?? 0;
        results = facetResult.data;

      } else {
        // No product filter: inventory-lead approach
        const hasInventoryFilter = !!(outletId || includeInactive === undefined);

        // ── Deep-page optimization ─────────────────────────────────
        // skip(99980) is very slow — MongoDB walks through 99k index entries.
        // Instead: find the _id at the skip offset via a covered index scan
        // (only reads _id from index, no document fetch), then range-query from there.
        let inventoryDocs;

        const countPromise = hasInventoryFilter
          ? Inventory.countDocuments(inventoryMatch)
          : Inventory.estimatedDocumentCount();

        if (skip > 5000) {
          // For deep pages: find the starting _id at skip offset (covered index scan)
          const skipDoc = await Inventory.findOne(inventoryMatch)
            .sort({ _id: 1 })
            .skip(skip)
            .select({ _id: 1 })
            .lean();

          if (!skipDoc) {
            // Page is beyond the data — return empty
            total = await countPromise;
            results = [];
          } else {
            [total, inventoryDocs] = await Promise.all([
              countPromise,
              Inventory.find({ ...inventoryMatch, _id: { $gte: skipDoc._id } })
                .sort({ _id: 1 })
                .limit(numLimit)
                .lean()
            ]);

            // Fetch products for just this page (max 200 IDs — very fast $in)
            const productIds = inventoryDocs.map(inv => inv.productId);
            const products = await Product.find({ _id: { $in: productIds } })
              .select("name sku barcode image price costPrice taxRate gstRate unit isActive categoryId brandId unitId packagingUnits")
              .populate({ path: "categoryId", select: "name icon color parentId" })
              .populate({ path: "brandId", select: "name logo slug" })
              .populate({ path: "unitId", select: "name abbreviation key" })
              .populate({ path: "packagingUnits.unitId", select: "name abbreviation key" })
              .lean();

            const productMap = new Map();
            for (const p of products) productMap.set(p._id.toString(), p);

            results = inventoryDocs.map(inv => {
              const product = productMap.get(inv.productId.toString());
              if (!product) return null;
              return mergeInventoryAndProduct({ ...inv, productId: product });
            }).filter(Boolean);
          }
        } else {
          // Shallow pages: normal skip is fast enough
          [total, inventoryDocs] = await Promise.all([
            countPromise,
            Inventory.find(inventoryMatch)
              .sort({ _id: 1 })
              .skip(skip)
              .limit(numLimit)
              .lean()
          ]);

          const productIds = inventoryDocs.map(inv => inv.productId);
          const products = await Product.find({ _id: { $in: productIds } })
            .select("name sku barcode image price costPrice taxRate gstRate unit isActive categoryId brandId unitId packagingUnits")
            .populate({ path: "categoryId", select: "name icon color parentId" })
            .populate({ path: "brandId", select: "name logo slug" })
            .populate({ path: "unitId", select: "name abbreviation key" })
            .populate({ path: "packagingUnits.unitId", select: "name abbreviation key" })
            .lean();

          const productMap = new Map();
          for (const p of products) productMap.set(p._id.toString(), p);

          results = inventoryDocs.map(inv => {
            const product = productMap.get(inv.productId.toString());
            if (!product) return null;
            return mergeInventoryAndProduct({ ...inv, productId: product });
          }).filter(Boolean);
        }
      }

      // Apply packagingUnits bulk qty calculation for aggregation results
      for (const product of results) {
        if (product.packagingUnits?.length) {
          for (const pkg of product.packagingUnits) {
            pkg.onHandBulkQty = (product.onHandQty != null && pkg.qtyPerUnit)
              ? Math.floor(product.onHandQty / pkg.qtyPerUnit) : 0;
          }
        }
      }

      meta = {
        pagination: {
          page: Number(page),
          limit: numLimit,
          total,
          totalPages: Math.ceil(total / numLimit)
        }
      };

      return successResponse({ res, message: "Products fetched successfully", data: results, meta });
    }
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
          { path: "categoryId", select: "name icon color parentId" },{ path: "brandId", select: "name logo slug" },
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
        outletId, categoryId, brandId, name, description, sku, barcode, unit, unitId, price, costPrice, taxRate, gstRate, hsnCode, packagingUnits, onHandQty, lowStockThreshold, isFeatured, image, tags, sortOrder
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
        businessId, categoryId, brandId, name, description, sku, barcode, unitId: unitId || undefined, unit: unit || "pcs", price, costPrice: costPrice || 0, taxRate: taxRate || 0, gstRate: gstRate || 0, hsnCode: hsnCode || undefined, packagingUnits: validatedPackaging, isFeatured: isFeatured || false, image, tags: tags || [], sortOrder: sortOrder || 0
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
      
      emitToBusiness(businessId.toString(), "products:updated", { productId: product._id });
      
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
    const allowed = ["name", "description", "categoryId", "brandId", "sku", "barcode", "unit", "unitId", "price", "costPrice", "taxRate", "gstRate", "hsnCode", "packagingUnits", "isFeatured", "image", "tags", "sortOrder", "isActive"];
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
      .populate({ path: "brandId", select: "name logo slug" })
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

    emitToBusiness(businessId.toString(), "products:updated", { productId: product._id });
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
    
    emitToBusiness(businessId.toString(), "products:updated", { productId: req.params.id });
    return successResponse({ res, message: "Product deactivated" });
  } catch (error) {
    return next(error);
  }
}

async function getGlobalProducts(req, res, next) {
  try {
    const { businessId } = req.user;
        const { outletId, search, categoryId, brandId, page = 1, limit = 50 } = req.query;

    const numLimit = Number(limit);
    const numPage = Number(page);

    const productMatch = { 
      businessId: new mongoose.Types.ObjectId(businessId), 
      isActive: true 
    };

    if (categoryId) {
      productMatch.categoryId = new mongoose.Types.ObjectId(categoryId);
    }
    if (brandId) {
      productMatch.brandId = new mongoose.Types.ObjectId(brandId);
    }

    if (search) {
      productMatch.$or = [
        { name: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
        { barcode: search }
      ];
    }

    // If no outletId filter, simple find + count
    if (!outletId) {
      const [total, products] = await Promise.all([
        Product.countDocuments(productMatch),
        Product.find(productMatch)
          .populate({ path: "categoryId", select: "name icon color parentId" }).populate({ path: "brandId", select: "name logo slug" })
          .skip((numPage - 1) * numLimit)
          .limit(numLimit)
          .lean()
      ]);

      return successResponse({
        res,
        message: "Global products fetched",
        data: products,
        meta: { pagination: { page: numPage, limit: numLimit, total, totalPages: Math.ceil(total / numLimit) } }
      });
    }

    // With outletId: use indexed $lookup anti-join instead of loading 100K IDs into $nin
    const pipeline = [
      { $match: productMatch },
      {
        $lookup: {
          from: "inventories",
          localField: "_id",
          foreignField: "productId",
          pipeline: [
            { $match: { outletId: new mongoose.Types.ObjectId(outletId), isActive: true } },
            { $limit: 1 },
            { $project: { _id: 1 } }
          ],
          as: "_inv"
        }
      },
      { $match: { _inv: { $size: 0 } } },
      { $project: { _inv: 0 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: (numPage - 1) * numLimit },
            { $limit: numLimit },
            {
              $lookup: {
                from: "brands",
                localField: "brandId",
                foreignField: "_id",
                pipeline: [{ $project: { name: 1, logo: 1, slug: 1 } }],
                as: "brandId"
              }
            },
            { $unwind: { path: "$brandId", preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: "categories",
                localField: "categoryId",
                foreignField: "_id",
                pipeline: [{ $project: { name: 1, icon: 1, color: 1, parentId: 1 } }],
                as: "categoryId"
              }
            },
            { $unwind: { path: "$categoryId", preserveNullAndEmptyArrays: true } }
          ]
        }
      }
    ];

    const results = await Product.aggregate(pipeline);
    const total = results[0].metadata[0] ? results[0].metadata[0].total : 0;
    const products = results[0].data;

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

