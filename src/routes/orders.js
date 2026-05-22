import { Router } from "express";
import { createOrder, listOrders, getOrder, refundOrder } from "../controllers/orderController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { idParamSchema, orderCreateSchema, refundOrderSchema } from "../validators/schemas.js";
const orderRouter = Router();
orderRouter.get("/", requireAuth, requirePermission("billing", "read"), listOrders);
orderRouter.get("/:id", requireAuth, requirePermission("billing", "read"), validate(idParamSchema, "params"), getOrder);
orderRouter.post("/", requireAuth, requirePermission("billing", "create"), validate(orderCreateSchema), createOrder);
orderRouter.post("/:id/refund", requireAuth, requirePermission("billing", "refund"), validate(idParamSchema, "params"), validate(refundOrderSchema), refundOrder);
export {
  orderRouter
};
