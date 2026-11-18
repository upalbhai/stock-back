import { Router } from "express";
import { listOutlets, createOutlet, updateOutlet, deleteOutlet, getOutlet } from "../controllers/outletController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";
import { outletCreateSchema, outletUpdateSchema } from "../validators/schemas.js";

const outletRouter = Router();

outletRouter.get("/", requireAuth, rateLimit("outletCrud"), listOutlets);
outletRouter.get("/:id", requireAuth, rateLimit("outletCrud"), getOutlet);
outletRouter.post("/", requireAuth, requirePermission("outlets", "create"), rateLimit("outletCrud"), validate(outletCreateSchema), createOutlet);
outletRouter.patch("/:id", requireAuth, requirePermission("outlets", "update"), rateLimit("outletCrud"), validate(outletUpdateSchema), updateOutlet);
outletRouter.delete("/:id", requireAuth, requirePermission("outlets", "delete"), rateLimit("outletCrud"), deleteOutlet);

export { outletRouter };
