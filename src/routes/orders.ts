import { Router } from "express";
import { createOrder, listOrders, getOrder, refundOrder } from "../controllers/orderController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";

export const orderRouter = Router();
orderRouter.get("/", requireAuth, requirePermission("billing", "read"), listOrders);
orderRouter.get("/:id", requireAuth, requirePermission("billing", "read"), getOrder);
orderRouter.post("/", requireAuth, requirePermission("billing", "create"), createOrder);
orderRouter.post("/:id/refund", requireAuth, requirePermission("billing", "refund"), refundOrder);
