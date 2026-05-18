import { Router } from "express";
import { getStockSummary, getStockAlerts, getStockHistory, adjustStock, createTransfer, approveTransfer, listTransfers } from "../controllers/stockController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";

export const stockRouter = Router();
stockRouter.get("/summary", requireAuth, getStockSummary);
stockRouter.get("/alerts", requireAuth, getStockAlerts);
stockRouter.get("/history", requireAuth, requirePermission("inventory", "read"), getStockHistory);
stockRouter.post("/adjust", requireAuth, requirePermission("inventory", "update"), adjustStock);
stockRouter.get("/transfers", requireAuth, requirePermission("stock_transfers", "read"), listTransfers);
stockRouter.post("/transfers", requireAuth, requirePermission("stock_transfers", "create"), createTransfer);
stockRouter.post("/transfers/:id/approve", requireAuth, requirePermission("stock_transfers", "approve"), approveTransfer);
