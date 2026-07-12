import { successResponse } from "../utils/successResponse.js";
import { Order } from "../models/Order.js";
import { Product } from "../models/Product.js";
import { Inventory } from "../models/Inventory.js";
import { Category } from "../models/Category.js";

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

async function getDashboardAnalytics(req, res, next) {
  try {
    const { businessId } = req.user;
    const {
      outletId,
      from,
      to,
      // Top-selling categories
      topCatPage = 1, topCatLimit = 5, topCatSort = "desc",
      // Top-selling products
      topProdPage = 1, topProdLimit = 5, topProdSort = "desc",
      // Revenue categories
      revCatPage = 1, revCatLimit = 5, revCatSort = "desc",
      // Revenue products
      revProdPage = 1, revProdLimit = 5, revProdSort = "desc",
      // Low stock
      lowStockPage = 1, lowStockLimit = 10,
    } = req.query;

    // ─── Build order match filter ───
    const orderMatch = { businessId, status: "completed" };
    if (outletId) orderMatch.outletId = outletId;
    const createdAt = buildDateRangeQuery(from, to);
    if (createdAt) orderMatch.createdAt = createdAt;

    // Convert ObjectId strings to actual ObjectId for aggregation
    const mongoose = (await import("mongoose")).default;
    if (orderMatch.businessId && typeof orderMatch.businessId === "string") {
      orderMatch.businessId = new mongoose.Types.ObjectId(orderMatch.businessId);
    }
    if (orderMatch.outletId && typeof orderMatch.outletId === "string") {
      orderMatch.outletId = new mongoose.Types.ObjectId(orderMatch.outletId);
    }

    // ─── 1. Orders aggregation: top-selling + revenue by category & product ───
    const orderAgg = await Order.aggregate([
      { $match: orderMatch },
      { $unwind: "$items" },
      // Look up the product to get its real categoryId (order items often don't store it)
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "_product",
          pipeline: [{ $project: { categoryId: 1 } }]
        }
      },
      {
        $addFields: {
          "items._resolvedCategoryId": {
            $ifNull: [
              { $arrayElemAt: ["$_product.categoryId", 0] },
              "$items.categoryId"
            ]
          }
        }
      },
      { $project: { _product: 0 } },
      {
        $facet: {
          // ── Top-selling by category (qty sold) ──
          topCatItems: [
            {
              $group: {
                _id: "$items._resolvedCategoryId",
                totalQty: { $sum: "$items.qty" },
                totalRevenue: { $sum: "$items.lineTotal" },
                orderCount: { $sum: 1 }
              }
            },
            { $sort: { totalQty: topCatSort === "asc" ? 1 : -1 } },
            { $skip: (Number(topCatPage) - 1) * Number(topCatLimit) },
            { $limit: Number(topCatLimit) }
          ],
          topCatTotal: [
            { $group: { _id: "$items._resolvedCategoryId" } },
            { $count: "count" }
          ],

          // ── Top-selling by product (qty sold) ──
          topProdItems: [
            {
              $group: {
                _id: "$items.productId",
                name: { $first: "$items.name" },
                totalQty: { $sum: "$items.qty" },
                totalRevenue: { $sum: "$items.lineTotal" },
                orderCount: { $sum: 1 }
              }
            },
            { $sort: { totalQty: topProdSort === "asc" ? 1 : -1 } },
            { $skip: (Number(topProdPage) - 1) * Number(topProdLimit) },
            { $limit: Number(topProdLimit) }
          ],
          topProdTotal: [
            { $group: { _id: "$items.productId" } },
            { $count: "count" }
          ],

          // ── Revenue by category ──
          revCatItems: [
            {
              $group: {
                _id: "$items._resolvedCategoryId",
                totalRevenue: { $sum: "$items.lineTotal" },
                totalQty: { $sum: "$items.qty" },
                orderCount: { $sum: 1 }
              }
            },
            { $sort: { totalRevenue: revCatSort === "asc" ? 1 : -1 } },
            { $skip: (Number(revCatPage) - 1) * Number(revCatLimit) },
            { $limit: Number(revCatLimit) }
          ],
          revCatTotal: [
            { $group: { _id: "$items._resolvedCategoryId" } },
            { $count: "count" }
          ],

          // ── Revenue by product ──
          revProdItems: [
            {
              $group: {
                _id: "$items.productId",
                name: { $first: "$items.name" },
                totalRevenue: { $sum: "$items.lineTotal" },
                totalQty: { $sum: "$items.qty" },
                orderCount: { $sum: 1 }
              }
            },
            { $sort: { totalRevenue: revProdSort === "asc" ? 1 : -1 } },
            { $skip: (Number(revProdPage) - 1) * Number(revProdLimit) },
            { $limit: Number(revProdLimit) }
          ],
          revProdTotal: [
            { $group: { _id: "$items.productId" } },
            { $count: "count" }
          ],

          // ── Sales trend ──
          salesTrend: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
                },
                revenue: { $sum: "$items.lineTotal" },
                orders: { $addToSet: "$_id" }
              }
            },
            { $sort: { _id: 1 } },
            {
              $project: {
                _id: 0,
                date: "$_id",
                revenue: 1,
                orders: { $size: "$orders" }
              }
            }
          ]
        }
      }
    ]);

    const agg = orderAgg[0] || {};

    // ─── Resolve category names ───
    const catIds = new Set();
    for (const item of [...(agg.topCatItems || []), ...(agg.revCatItems || [])]) {
      if (item._id) catIds.add(item._id.toString());
    }
    const categories = catIds.size
      ? await Category.find({ _id: { $in: [...catIds] } }).select("name icon color").lean()
      : [];
    const catMap = new Map(categories.map(c => [c._id.toString(), c]));

    function enrichCategory(item) {
      const cat = item._id ? catMap.get(item._id.toString()) : null;
      return {
        categoryId: item._id || null,
        name: cat?.name || "Uncategorized",
        icon: cat?.icon || "📦",
        color: cat?.color || "#6366f1",
        totalQty: item.totalQty || 0,
        totalRevenue: item.totalRevenue || 0,
        orderCount: item.orderCount || 0
      };
    }

    function enrichProduct(item) {
      return {
        productId: item._id || null,
        name: item.name || "Unknown",
        totalQty: item.totalQty || 0,
        totalRevenue: item.totalRevenue || 0,
        orderCount: item.orderCount || 0
      };
    }

    // ─── 2. Low-stock products ───
    const lowStockMatch = { businessId, isActive: true, $expr: { $lte: ["$onHandQty", "$lowStockThreshold"] } };
    if (outletId) lowStockMatch.outletId = outletId;

    const [lowStockInventory, lowStockTotal] = await Promise.all([
      Inventory.find(lowStockMatch)
        .sort({ onHandQty: 1 })
        .skip((Number(lowStockPage) - 1) * Number(lowStockLimit))
        .limit(Number(lowStockLimit))
        .populate({
          path: "productId",
          select: "name categoryId unit sku price",
          populate: { path: "categoryId", select: "name icon color" }
        })
        .lean(),
      Inventory.countDocuments(lowStockMatch)
    ]);

    const lowStockProducts = lowStockInventory
      .filter(i => i.productId != null)
      .map(i => ({
        ...i.productId,
        onHandQty: i.onHandQty,
        lowStockThreshold: i.lowStockThreshold
      }));

    // ─── 3. Low-stock categories (group low-stock products by category) ───
    const allLowStockForCategories = await Inventory.find(lowStockMatch)
      .populate({
        path: "productId",
        select: "categoryId",
        populate: { path: "categoryId", select: "name icon color" }
      })
      .lean();

    const lowStockCatMap = new Map();
    for (const p of allLowStockForCategories) {
      if (!p.productId) continue;
      const catId = p.productId.categoryId?._id?.toString() || "uncategorized";
      if (!lowStockCatMap.has(catId)) {
        lowStockCatMap.set(catId, {
          categoryId: p.productId.categoryId?._id || null,
          name: p.productId.categoryId?.name || "Uncategorized",
          icon: p.productId.categoryId?.icon || "📦",
          color: p.productId.categoryId?.color || "#6366f1",
          count: 0,
          criticalCount: 0
        });
      }
      const entry = lowStockCatMap.get(catId);
      entry.count += 1;
      if (p.onHandQty <= 0) entry.criticalCount += 1;
    }
    const lowStockCategories = [...lowStockCatMap.values()].sort((a, b) => b.count - a.count);

    return successResponse({
      res,
      data: {
        topSellingCategories: {
          items: (agg.topCatItems || []).map(enrichCategory),
          total: agg.topCatTotal?.[0]?.count || 0,
          page: Number(topCatPage)
        },
        topSellingProducts: {
          items: (agg.topProdItems || []).map(enrichProduct),
          total: agg.topProdTotal?.[0]?.count || 0,
          page: Number(topProdPage)
        },
        revenueByCategory: {
          items: (agg.revCatItems || []).map(enrichCategory),
          total: agg.revCatTotal?.[0]?.count || 0,
          page: Number(revCatPage)
        },
        revenueByProduct: {
          items: (agg.revProdItems || []).map(enrichProduct),
          total: agg.revProdTotal?.[0]?.count || 0,
          page: Number(revProdPage)
        },
        lowStockProducts: {
          items: lowStockProducts.map(p => ({
            productId: p._id,
            name: p.name,
            sku: p.sku || "",
            unit: p.unit || "pcs",
            price: p.price || 0,
            onHandQty: p.onHandQty,
            lowStockThreshold: p.lowStockThreshold,
            stockPercent: p.lowStockThreshold > 0 ? Math.round((p.onHandQty / p.lowStockThreshold) * 100) : 0,
            categoryName: p.categoryId?.name || "Uncategorized",
            categoryIcon: p.categoryId?.icon || "📦",
            categoryColor: p.categoryId?.color || "#6366f1"
          })),
          total: lowStockTotal,
          page: Number(lowStockPage)
        },
        lowStockCategories: {
          items: lowStockCategories,
          total: lowStockCategories.length
        },
        salesTrend: agg.salesTrend || []
      }
    });
  } catch (error) {
    return next(error);
  }
}

export { getDashboardAnalytics };
