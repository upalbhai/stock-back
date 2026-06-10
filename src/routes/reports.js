import { Router } from "express";
import { getDailyReport, getOutletComparison, getRevenueTrend, getWholesaleSummary, getProfitLedger } from "../controllers/reportController.js";
import { requireAuth } from "../middlewares/auth.js";
const reportRouter = Router();
reportRouter.get("/daily", requireAuth, getDailyReport);
reportRouter.get("/summary", requireAuth, getWholesaleSummary);
reportRouter.get("/profit-ledger", requireAuth, getProfitLedger);
reportRouter.get("/compare", requireAuth, getOutletComparison);
reportRouter.get("/trend", requireAuth, getRevenueTrend);
export {
  reportRouter
};
