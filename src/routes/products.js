import { Router } from "express";
import { listProducts, getProduct, createProduct, updateProduct, deleteProduct, getGlobalProducts, importProduct } from "../controllers/productController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";
import { cacheRoute, invalidateCache } from "../middlewares/cache.js";
import { idParamSchema, productCreateSchema, productUpdateSchema } from "../validators/schemas.js";

const productRouter = Router();

// GET routes are cached for 5 minutes (300s)
productRouter.get("/", requireAuth, rateLimit("productSearch"), cacheRoute(300), listProducts);
productRouter.get("/global", requireAuth, rateLimit("productSearch"), cacheRoute(300), getGlobalProducts);
productRouter.get("/:id", requireAuth, rateLimit("productSearch"), validate(idParamSchema, "params"), getProduct);

// Mutations invalidate the /api/products cache so users see fresh data immediately
productRouter.post("/:id/import", requireAuth, requirePermission("products", "create"), rateLimit("productCrud"), invalidateCache("/api/products"), validate(idParamSchema, "params"), importProduct);
productRouter.post("/", requireAuth, requirePermission("products", "create"), rateLimit("productCrud"), invalidateCache("/api/products"), validate(productCreateSchema), createProduct);
productRouter.patch("/:id", requireAuth, requirePermission("products", "update"), rateLimit("productCrud"), invalidateCache("/api/products"), validate(idParamSchema, "params"), validate(productUpdateSchema), updateProduct);
productRouter.delete("/:id", requireAuth, requirePermission("products", "delete"), rateLimit("productCrud"), invalidateCache("/api/products"), validate(idParamSchema, "params"), deleteProduct);

export { productRouter };
