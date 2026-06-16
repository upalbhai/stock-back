import { Router } from "express";
import { getStockSummary, getStockAlerts, getStockHistory, adjustStock, createTransfer, approveTransfer, listTransfers, updateStockEntry, deleteStockEntry } from "../controllers/stockController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { idParamSchema, stockAdjustSchema, stockTransferSchema } from "../validators/schemas.js";

const stockRouter = Router();

stockRouter.get("/summary", requireAuth, getStockSummary);
stockRouter.get("/alerts", requireAuth, getStockAlerts);
stockRouter.get("/history", requireAuth, requirePermission("inventory", "read"), getStockHistory);
stockRouter.post("/adjust", requireAuth, requirePermission("inventory", "update"), validate(stockAdjustSchema), adjustStock);

stockRouter.put("/entries/:id", requireAuth, requirePermission("inventory", "update"), updateStockEntry);
stockRouter.delete("/entries/:id", requireAuth, requirePermission("inventory", "update"), deleteStockEntry);

stockRouter.get("/transfers", requireAuth, requirePermission("stock_transfers", "read"), listTransfers);
stockRouter.post("/transfers", requireAuth, requirePermission("stock_transfers", "create"), validate(stockTransferSchema), createTransfer);
stockRouter.post("/transfers/:id/approve", requireAuth, requirePermission("stock_transfers", "approve"), validate(idParamSchema, "params"), approveTransfer);

export {
  stockRouter
};
