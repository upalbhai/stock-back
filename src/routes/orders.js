import { Router } from "express";
import { createOrder, listOrders, getOrder, refundOrder, voidOrder } from "../controllers/orderController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { requireFeature } from "../middlewares/feature.js";
import { validate } from "../middlewares/validate.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";
import { invalidateCache } from "../middlewares/cache.js";
import { idParamSchema, orderCreateSchema, refundOrderSchema, voidRecordSchema } from "../validators/schemas.js";

const orderRouter = Router();

orderRouter.get("/", requireAuth, requirePermission("billing", "read"), rateLimit("orderCrud"), listOrders);
orderRouter.get("/:id", requireAuth, requirePermission("billing", "read"), rateLimit("orderCrud"), validate(idParamSchema, "params"), getOrder);
orderRouter.post("/", requireAuth, requirePermission("billing", "create"), rateLimit("orderCrud"), invalidateCache("/api/products"), validate(orderCreateSchema), createOrder);
orderRouter.post("/:id/refund", requireAuth, requirePermission("billing", "refund"), rateLimit("orderCrud"), invalidateCache("/api/products"), validate(idParamSchema, "params"), validate(refundOrderSchema), refundOrder);
orderRouter.post("/:id/void", requireAuth, requireFeature("order_void"), requirePermission("billing", "void"), rateLimit("orderCrud"), invalidateCache("/api/products"), validate(idParamSchema, "params"), validate(voidRecordSchema), voidOrder);

export { orderRouter };
