import { Router } from "express";
import { listRoles, getRole, createRole, updateRole, deleteRole } from "../controllers/roleController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";
import { roleCreateSchema, roleUpdateSchema } from "../validators/schemas.js";

const roleRouter = Router();

roleRouter.get("/", requireAuth, rateLimit("roleCrud"), listRoles);
roleRouter.get("/:id", requireAuth, rateLimit("roleCrud"), getRole);
roleRouter.post("/", requireAuth, requirePermission("roles", "create"), rateLimit("roleCrud"), validate(roleCreateSchema), createRole);
roleRouter.patch("/:id", requireAuth, requirePermission("roles", "update"), rateLimit("roleCrud"), validate(roleUpdateSchema), updateRole);
roleRouter.delete("/:id", requireAuth, requirePermission("roles", "delete"), rateLimit("roleCrud"), deleteRole);

export { roleRouter };
