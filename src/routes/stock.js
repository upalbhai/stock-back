import { Router } from "express";
import { getStockSummary, getStockAlerts, getStockHistory, adjustStock, createTransfer, approveTransfer, listTransfers, updateStockEntry, deleteStockEntry } from "../controllers/stockController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";
import { idParamSchema, stockAdjustSchema, stockTransferSchema } from "../validators/schemas.js";

const stockRouter = Router();

stockRouter.get("/summary", requireAuth, rateLimit("stockCrud"), getStockSummary);
stockRouter.get("/alerts", requireAuth, rateLimit("stockCrud"), getStockAlerts);
stockRouter.get("/history", requireAuth, requirePermission("inventory", "read"), rateLimit("stockCrud"), getStockHistory);
stockRouter.post("/adjust", requireAuth, requirePermission("inventory", "update"), rateLimit("stockCrud"), validate(stockAdjustSchema), adjustStock);

stockRouter.put("/entries/:id", requireAuth, requirePermission("inventory", "update"), rateLimit("stockCrud"), updateStockEntry);
stockRouter.delete("/entries/:id", requireAuth, requirePermission("inventory", "update"), rateLimit("stockCrud"), deleteStockEntry);

stockRouter.get("/transfers", requireAuth, requirePermission("stock_transfers", "read"), rateLimit("stockCrud"), listTransfers);
stockRouter.post("/transfers", requireAuth, requirePermission("stock_transfers", "create"), rateLimit("stockCrud"), validate(stockTransferSchema), createTransfer);
stockRouter.post("/transfers/:id/approve", requireAuth, requirePermission("stock_transfers", "approve"), rateLimit("stockCrud"), validate(idParamSchema, "params"), approveTransfer);

export { stockRouter };
