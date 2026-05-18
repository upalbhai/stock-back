import { Router } from "express";
import { z } from "zod";
import {
  getStockAlerts,
  getStockSummary,
  setOpeningStock
} from "../controllers/stockController.js";
import { requireAuth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";

export const stockRouter = Router();

const openingSchema = z.object({
  outletId: z.string().min(1),
  date: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      openingQty: z.number().min(0)
    })
  )
});

stockRouter.post("/opening", requireAuth, validate(openingSchema), setOpeningStock);
stockRouter.get("/alerts", requireAuth, getStockAlerts);
stockRouter.get("/summary", requireAuth, getStockSummary);
