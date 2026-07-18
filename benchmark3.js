import mongoose from "mongoose";
import dotenv from "dotenv";
import { Inventory } from "./src/models/Inventory.js";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const businessId = new mongoose.Types.ObjectId("6a599723e77798c94870fa4d");
  const outletId = new mongoose.Types.ObjectId("6a599723e77798c94870fa4f");
  const lowStockMatch = { businessId, isActive: true, outletId, $expr: { $lte: ["$onHandQty", "$lowStockThreshold"] } };

  console.time("Low Stock Cat Aggregation");
  const lowStockCatAgg = await Inventory.aggregate([
    { $match: lowStockMatch },
    {
      $lookup: {
        from: "products",
        localField: "productId",
        foreignField: "_id",
        as: "product"
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
  console.timeEnd("Low Stock Cat Aggregation");
  console.log(JSON.stringify(lowStockCatAgg, null, 2));

  process.exit(0);
}
run();
