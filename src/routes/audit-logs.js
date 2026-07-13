import { Router } from "express";
import { listAuditLogs } from "../controllers/auditController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";

const auditRouter = Router();

auditRouter.get("/", requireAuth, requirePermission("audit_logs", "read"), rateLimit("auditLogs"), listAuditLogs);

export { auditRouter };
