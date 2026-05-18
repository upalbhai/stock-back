import { Router } from "express";
import { listRoles, getRole, createRole, updateRole, deleteRole } from "../controllers/roleController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
const roleRouter = Router();
roleRouter.get("/", requireAuth, listRoles);
roleRouter.get("/:id", requireAuth, getRole);
roleRouter.post("/", requireAuth, requirePermission("roles", "create"), createRole);
roleRouter.patch("/:id", requireAuth, requirePermission("roles", "update"), updateRole);
roleRouter.delete("/:id", requireAuth, requirePermission("roles", "delete"), deleteRole);
export {
  roleRouter
};
