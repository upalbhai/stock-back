import { Router } from "express";
import { z } from "zod";
import { createProduct, listProducts } from "../controllers/productController.js";
import { requireAuth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";

export const productRouter = Router();

const productSchema = z.object({
  outletId: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().min(1),
  price: z.number().min(0),
  taxRate: z.number().min(0).max(1).optional(),
  sku: z.string().optional(),
  lowStockThreshold: z.number().min(0).optional(),
  onHandQty: z.number().min(0).optional()
});

productRouter.get("/", requireAuth, listProducts);
productRouter.post("/", requireAuth, validate(productSchema), createProduct);
