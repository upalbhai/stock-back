import { Router } from "express";
import { getDailyReport, getOutletComparison, getRevenueTrend } from "../controllers/reportController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";

export const reportRouter = Router();
reportRouter.get("/daily", requireAuth, getDailyReport);
reportRouter.get("/compare", requireAuth, getOutletComparison);
reportRouter.get("/trend", requireAuth, getRevenueTrend);
