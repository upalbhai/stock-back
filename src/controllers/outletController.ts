import type { Request, Response, NextFunction } from "express";
import { Outlet } from "../models/Outlet.js";

function makeOutletCode(name: string) {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 12) || "outlet";
}

export async function listOutlets(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const outlets = await Outlet.find().sort({ name: 1 }).lean();
    res.json({ data: outlets });
  } catch (error) {
    next(error);
  }
}

export async function createOutlet(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { name, address, code } = req.body;
    const outlet = await Outlet.create({
      name,
      address,
      code: code || makeOutletCode(name)
    });
    res.status(201).json({ data: outlet });
  } catch (error) {
    next(error);
  }
}
