import { Router } from "express";
import { listOutlets, createOutlet, updateOutlet, deleteOutlet, getOutlet } from "../controllers/outletController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";

export const outletRouter = Router();
outletRouter.get("/", requireAuth, listOutlets);
outletRouter.get("/:id", requireAuth, getOutlet);
outletRouter.post("/", requireAuth, requirePermission("outlets", "create"), createOutlet);
outletRouter.patch("/:id", requireAuth, requirePermission("outlets", "update"), updateOutlet);
outletRouter.delete("/:id", requireAuth, requirePermission("outlets", "delete"), deleteOutlet);
