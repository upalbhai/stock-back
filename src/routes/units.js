import { Router } from "express";
import { listUnits, createUnit, updateUnit, deleteUnit } from "../controllers/unitController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";
import { cacheRoute, invalidateCache } from "../middlewares/cache.js";
import { idParamSchema, unitCreateSchema, unitUpdateSchema } from "../validators/schemas.js";

const unitRouter = Router();

// Cache GET routes for 5 minutes
unitRouter.get("/", requireAuth, rateLimit("unitList"), cacheRoute(300), listUnits);

// Invalidate cache on mutations
unitRouter.post("/", requireAuth, requirePermission("units", "create"), rateLimit("unitCrud"), invalidateCache("/api/units"), validate(unitCreateSchema), createUnit);
unitRouter.patch("/:id", requireAuth, requirePermission("units", "update"), rateLimit("unitCrud"), invalidateCache("/api/units"), validate(idParamSchema, "params"), validate(unitUpdateSchema), updateUnit);
unitRouter.delete("/:id", requireAuth, requirePermission("units", "delete"), rateLimit("unitCrud"), invalidateCache("/api/units"), validate(idParamSchema, "params"), deleteUnit);

export { unitRouter };
