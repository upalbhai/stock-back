import { Router } from "express";
import { printToNetworkPrinter } from "../controllers/printController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";

const printRouter = Router();

// Requires auth + billing create permission (same as placing an order)
printRouter.post(
  "/pos",
  requireAuth,
  requirePermission("billing", "create"),
  printToNetworkPrinter
);

export { printRouter };
