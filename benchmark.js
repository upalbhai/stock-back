import mongoose from "mongoose";
import dotenv from "dotenv";
import { StockEntry } from "./src/models/StockEntry.js";
import { Inventory } from "./src/models/Inventory.js";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const businessId = new mongoose.Types.ObjectId("6a599723e77798c94870fa4d");
  const outletId = new mongoose.Types.ObjectId("6a599723e77798c94870fa4f");
  const query = { businessId, outletId };

  console.time("StockEntry.find");
  await StockEntry.find(query).sort({ createdAt: -1 }).limit(50).lean();
  console.timeEnd("StockEntry.find");

  console.time("StockEntry.aggregate");
  await StockEntry.aggregate([
    { $match: query },
    { $group: { _id: null, total: { $sum: 1 } } }
  ]);
  console.timeEnd("StockEntry.aggregate");

  console.time("Inventory.aggregate");
  await Inventory.aggregate([
    { $match: { businessId, outletId, isActive: true } },
    { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "product" } },
    { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
    { $group: {
        _id: null,
        onHandCostValue: { $sum: { $multiply: ["$onHandQty", { $ifNull: ["$product.costPrice", 0] }] } }
    }}
  ]);
  console.timeEnd("Inventory.aggregate");

  process.exit(0);
}
run();
