import { Router } from "express";
import { listCategories, createCategory, updateCategory, deleteCategory } from "../controllers/categoryController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";
import { cacheRoute, invalidateCache } from "../middlewares/cache.js";
import { categoryCreateSchema, categoryUpdateSchema, idParamSchema } from "../validators/schemas.js";

const categoryRouter = Router();

// Cache GET routes for 5 minutes
categoryRouter.get("/", requireAuth, rateLimit("categoryList"), cacheRoute(300), listCategories);

// Invalidate cache on mutations
categoryRouter.post("/", requireAuth, requirePermission("categories", "create"), rateLimit("categoryCrud"), invalidateCache("/api/categories"), validate(categoryCreateSchema), createCategory);
categoryRouter.patch("/:id", requireAuth, requirePermission("categories", "update"), rateLimit("categoryCrud"), invalidateCache("/api/categories"), validate(idParamSchema, "params"), validate(categoryUpdateSchema), updateCategory);
categoryRouter.delete("/:id", requireAuth, requirePermission("categories", "delete"), rateLimit("categoryCrud"), invalidateCache("/api/categories"), validate(idParamSchema, "params"), deleteCategory);

export { categoryRouter };
