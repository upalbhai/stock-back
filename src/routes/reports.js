import { Router } from "express";
import { getDailyReport, getOutletComparison, getRevenueTrend } from "../controllers/reportController.js";
import { requireAuth } from "../middlewares/auth.js";
const reportRouter = Router();
reportRouter.get("/daily", requireAuth, getDailyReport);
reportRouter.get("/compare", requireAuth, getOutletComparison);
reportRouter.get("/trend", requireAuth, getRevenueTrend);
export {
  reportRouter
};
