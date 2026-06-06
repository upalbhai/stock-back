import { Router } from "express";
import { createOrder, listOrders, getOrder, refundOrder, voidOrder } from "../controllers/orderController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { requireFeature } from "../middlewares/feature.js";
import { validate } from "../middlewares/validate.js";
import { idParamSchema, orderCreateSchema, refundOrderSchema, voidRecordSchema } from "../validators/schemas.js";
const orderRouter = Router();
orderRouter.get("/", requireAuth, requirePermission("billing", "read"), listOrders);
orderRouter.get("/:id", requireAuth, requirePermission("billing", "read"), validate(idParamSchema, "params"), getOrder);
orderRouter.post("/", requireAuth, requirePermission("billing", "create"), validate(orderCreateSchema), createOrder);
orderRouter.post("/:id/refund", requireAuth, requirePermission("billing", "refund"), validate(idParamSchema, "params"), validate(refundOrderSchema), refundOrder);
orderRouter.post("/:id/void", requireAuth, requireFeature("order_void"), requirePermission("billing", "void"), validate(idParamSchema, "params"), validate(voidRecordSchema), voidOrder);
export {
  orderRouter
};
