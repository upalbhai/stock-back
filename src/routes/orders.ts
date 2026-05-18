import { Router } from "express";
import { z } from "zod";
import { createOrder, listOrders } from "../controllers/orderController.js";
import { requireAuth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";

export const orderRouter = Router();

const orderSchema = z.object({
  outletId: z.string().min(1),
  createdBy: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        name: z.string().min(1),
        qty: z.number().min(1),
        price: z.number().min(0),
        taxRate: z.number().min(0).max(1).optional()
      })
    )
    .min(1),
  payment: z
    .object({
      method: z.enum(["cash", "online", "card", "split"]).optional(),
      cash: z.number().min(0).optional(),
      online: z.number().min(0).optional(),
      card: z.number().min(0).optional()
    })
    .optional()
});

orderRouter.get("/", requireAuth, listOrders);
orderRouter.post("/", requireAuth, validate(orderSchema), createOrder);
