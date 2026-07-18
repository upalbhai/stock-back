import mongoose from "mongoose";
import dotenv from "dotenv";
import { Product } from "./src/models/Product.js";
import { Inventory } from "./src/models/Inventory.js";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const businessId = new mongoose.Types.ObjectId("6a599723e77798c94870fa4d");
  const outletId = new mongoose.Types.ObjectId("6a599723e77798c94870fa4f");

  console.time("Separate queries + JS Math");
  const [inventories, products] = await Promise.all([
    Inventory.find({ businessId, outletId, isActive: true }).select("productId onHandQty").lean(),
    Product.find({ businessId }).select("_id costPrice price").lean()
  ]);
  const pMap = new Map();
  for (let i = 0; i < products.length; i++) {
    pMap.set(products[i]._id.toString(), products[i]);
  }
  let cost = 0; let sell = 0;
  for (let i = 0; i < inventories.length; i++) {
    const inv = inventories[i];
    const p = pMap.get(inv.productId.toString());
    if (p) {
      cost += (inv.onHandQty || 0) * (p.costPrice || 0);
      sell += (inv.onHandQty || 0) * (p.price || 0);
    }
  }
  console.timeEnd("Separate queries + JS Math");

  process.exit(0);
}
run();
