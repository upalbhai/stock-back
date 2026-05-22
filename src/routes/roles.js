import { Router } from "express";
import { listRoles, getRole, createRole, updateRole, deleteRole } from "../controllers/roleController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { roleCreateSchema, roleUpdateSchema } from "../validators/schemas.js";
const roleRouter = Router();
roleRouter.get("/", requireAuth, listRoles);
roleRouter.get("/:id", requireAuth, getRole);
roleRouter.post("/", requireAuth, requirePermission("roles", "create"), validate(roleCreateSchema), createRole);
roleRouter.patch("/:id", requireAuth, requirePermission("roles", "update"), validate(roleUpdateSchema), updateRole);
roleRouter.delete("/:id", requireAuth, requirePermission("roles", "delete"), deleteRole);
export {
  roleRouter
};
