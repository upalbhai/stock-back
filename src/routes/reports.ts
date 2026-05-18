import { Router } from "express";
import { dailyReport } from "../controllers/reportController.js";
import { requireAuth } from "../middlewares/auth.js";

export const reportRouter = Router();

reportRouter.get("/daily", requireAuth, dailyReport);
