import { Router } from "express";
import { getDailyReport, getOutletComparison, getRevenueTrend, getWholesaleSummary, getProfitLedger } from "../controllers/reportController.js";
import { getDashboardAnalytics } from "../controllers/dashboardAnalyticsController.js";
import { requireAuth } from "../middlewares/auth.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";

const reportRouter = Router();

reportRouter.get("/daily", requireAuth, rateLimit("reports"), getDailyReport);
reportRouter.get("/summary", requireAuth, rateLimit("reports"), getWholesaleSummary);
reportRouter.get("/profit-ledger", requireAuth, rateLimit("reports"), getProfitLedger);
reportRouter.get("/compare", requireAuth, rateLimit("reports"), getOutletComparison);
reportRouter.get("/trend", requireAuth, rateLimit("reports"), getRevenueTrend);
reportRouter.get("/dashboard-analytics", requireAuth, rateLimit("dashboard"), getDashboardAnalytics);

export { reportRouter };
