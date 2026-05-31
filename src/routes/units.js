import { Router } from "express";
import { listUnits, createUnit, updateUnit, deleteUnit } from "../controllers/unitController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { idParamSchema, unitCreateSchema, unitUpdateSchema } from "../validators/schemas.js";

const unitRouter = Router();
unitRouter.get("/", requireAuth, listUnits);
unitRouter.post("/", requireAuth, requirePermission("units", "create"), validate(unitCreateSchema), createUnit);
unitRouter.patch("/:id", requireAuth, requirePermission("units", "update"), validate(idParamSchema, "params"), validate(unitUpdateSchema), updateUnit);
unitRouter.delete("/:id", requireAuth, requirePermission("units", "delete"), validate(idParamSchema, "params"), deleteUnit);

export { unitRouter };
