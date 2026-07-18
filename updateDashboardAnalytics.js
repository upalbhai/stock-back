import fs from 'fs';

const file = '/Users/neshmapatel/Desktop/Upal Projects/stock_inventory/stock-back/src/controllers/dashboardAnalyticsController.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Add new query params
content = content.replace(
  'lowStockPage = 1, lowStockLimit = 10,',
  'lowStockPage = 1, lowStockLimit = 10, lowStockSearch = "",\n      lowStockCatPage = 1, lowStockCatLimit = 10, lowStockCatSearch = "",'
);

// 2. Separate matchers
content = content.replace(
  'const lowStockMatch = { businessId: new mongoose.Types.ObjectId(businessId), isActive: true, $expr: { $lte: ["$onHandQty", "$lowStockThreshold"] } };\n    if (outletId) lowStockMatch.outletId = new mongoose.Types.ObjectId(outletId);\n\n    const [lowStockInventory, lowStockTotal] = await Promise.all([',
  `const lowStockMatch = { businessId: new mongoose.Types.ObjectId(businessId), isActive: true, $expr: { $lte: ["$onHandQty", "$lowStockThreshold"] } };
    if (outletId) lowStockMatch.outletId = new mongoose.Types.ObjectId(outletId);

    const lowStockProdMatch = { ...lowStockMatch };
    const prodTerm = String(lowStockSearch || "").trim();
    if (prodTerm) {
      const matchingProducts = await Product.find({
        businessId,
        $or: [
          { name: { $regex: prodTerm, $options: "i" } },
          { sku: { $regex: prodTerm, $options: "i" } }
        ]
      }).select("_id").lean();
      lowStockProdMatch.productId = { $in: matchingProducts.map(p => p._id) };
    }

    const [lowStockInventory, lowStockTotal] = await Promise.all([`
);

// Replace Inventory.find(lowStockMatch) with lowStockProdMatch
content = content.replace(
  'Inventory.find(lowStockMatch)',
  'Inventory.find(lowStockProdMatch)'
);
content = content.replace(
  'Inventory.countDocuments(lowStockMatch)',
  'Inventory.countDocuments(lowStockProdMatch)'
);

// 3. Update Categories Aggregation with Search and Pagination
const catAggOld = `    const lowStockCatAgg = await Inventory.aggregate([
      { $match: lowStockMatch },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product",
          pipeline: [{ $project: { categoryId: 1 } }]
        }
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$product.categoryId",
          count: { $sum: 1 },
          criticalCount: { $sum: { $cond: [{ $lte: ["$onHandQty", 0] }, 1, 0] } }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category"
        }
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } }
    ]);

    const lowStockCategories = lowStockCatAgg.map(cat => ({
      categoryId: cat._id || null,
      name: cat.category?.name || "Uncategorized",
      icon: cat.category?.icon || "📦",
      color: cat.category?.color || "#6366f1",
      count: cat.count,
      criticalCount: cat.criticalCount
    }));`;

const catAggNew = `    const catTerm = String(lowStockCatSearch || "").trim();
    
    const catPipeline = [
      { $match: lowStockMatch },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product",
          pipeline: [{ $project: { categoryId: 1 } }]
        }
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$product.categoryId",
          count: { $sum: 1 },
          criticalCount: { $sum: { $cond: [{ $lte: ["$onHandQty", 0] }, 1, 0] } }
        }
      },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category"
        }
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } }
    ];

    if (catTerm) {
      catPipeline.push({
        $match: {
          "category.name": { $regex: catTerm, $options: "i" }
        }
      });
    }

    catPipeline.push({ $sort: { count: -1 } });
    
    catPipeline.push({
      $facet: {
        items: [
          { $skip: (Number(lowStockCatPage) - 1) * Number(lowStockCatLimit) },
          { $limit: Number(lowStockCatLimit) }
        ],
        total: [{ $count: "count" }]
      }
    });

    const lowStockCatAgg = await Inventory.aggregate(catPipeline);
    const catFacet = lowStockCatAgg[0] || {};
    const catItems = catFacet.items || [];
    const catTotal = catFacet.total?.[0]?.count || 0;

    const lowStockCategories = catItems.map(cat => ({
      categoryId: cat._id || null,
      name: cat.category?.name || "Uncategorized",
      icon: cat.category?.icon || "📦",
      color: cat.category?.color || "#6366f1",
      count: cat.count,
      criticalCount: cat.criticalCount
    }));`;

content = content.replace(catAggOld, catAggNew);

// 4. Update the return object for lowStockCategories
content = content.replace(
  /lowStockCategories: \{\n          items: lowStockCategories,\n          total: lowStockCategories\.length\n        \}/g,
  `lowStockCategories: {
          items: lowStockCategories,
          total: catTotal,
          page: Number(lowStockCatPage)
        }`
);

fs.writeFileSync(file, content);
console.log('Updated backend analytics controller.');
