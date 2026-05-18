import { Router } from "express";
import { listAuditLogs } from "../controllers/auditController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";

export const auditRouter = Router();
auditRouter.get("/", requireAuth, requirePermission("audit_logs", "read"), listAuditLogs);
