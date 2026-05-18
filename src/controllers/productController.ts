import type { Request, Response, NextFunction } from "express";
import { Product } from "../models/Product.js";

export async function listProducts(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const outletId = req.query.outletId as string | undefined;
    const barcode = req.query.barcode as string | undefined;
    const sku = req.query.sku as string | undefined;
    const q = req.query.q as string | undefined;

    const filter: Record<string, unknown> = {};
    if (outletId) {
      filter.outletId = outletId;
    }
    if (barcode) {
      filter.barcode = barcode;
    }
    if (sku) {
      filter.sku = sku;
    }
    if (q) {
      filter.name = { $regex: q, $options: "i" };
    }
    const products = await Product.find(filter).sort({ name: 1 }).lean();
    res.json({ data: products });
  } catch (error) {
    next(error);
  }
}

export async function createProduct(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const payload = req.body as {
      taxRate?: number;
      gstRate?: number;
    };
    if (payload.taxRate === undefined && payload.gstRate !== undefined) {
      payload.taxRate = payload.gstRate;
    }
    const product = await Product.create(payload);
    res.status(201).json({ data: product });
  } catch (error) {
    next(error);
  }
}
