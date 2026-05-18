import type { Request, Response, NextFunction } from "express";
import { Product } from "../models/Product.js";
import { StockEntry } from "../models/StockEntry.js";

export async function setOpeningStock(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { outletId, date, items } = req.body;
    const entryDate = date ? new Date(date) : new Date();

    await Promise.all(
      items.map(async (item: { productId: string; openingQty: number }) => {
        await Product.findByIdAndUpdate(item.productId, {
          $set: { onHandQty: item.openingQty }
        });

        await StockEntry.create({
          outletId,
          productId: item.productId,
          date: entryDate,
          openingQty: item.openingQty,
          closingQty: item.openingQty
        });
      })
    );

    res.status(201).json({ message: "Opening stock saved" });
  } catch (error) {
    next(error);
  }
}

export async function getStockAlerts(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { outletId } = req.query;
    const alerts = await Product.find({
      outletId,
      $expr: { $lte: ["$onHandQty", "$lowStockThreshold"] }
    })
      .select("name onHandQty lowStockThreshold")
      .lean();

    res.json({ data: alerts });
  } catch (error) {
    next(error);
  }
}

export async function getStockSummary(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { outletId } = req.query;
    const products = await Product.find({ outletId }).lean();

    const totalSkus = products.length;
    const onHandTotal = products.reduce(
      (sum, product) => sum + (product.onHandQty || 0),
      0
    );
    const lowStock = products.filter(
      (product) =>
        (product.onHandQty || 0) <= (product.lowStockThreshold || 0)
    ).length;

    res.json({ data: { totalSkus, onHandTotal, lowStock } });
  } catch (error) {
    next(error);
  }
}
