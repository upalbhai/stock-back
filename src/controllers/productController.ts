import type { Request, Response, NextFunction } from "express";
import { Product } from "../models/Product.js";

export async function listProducts(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { outletId } = req.query;
    const filter = outletId ? { outletId } : {};
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
    const product = await Product.create(req.body);
    res.status(201).json({ data: product });
  } catch (error) {
    next(error);
  }
}
