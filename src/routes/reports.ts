import { Router } from "express";
import { dailyReport } from "../controllers/reportController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/roles.js";

export const reportRouter = Router();

reportRouter.get(
	"/daily",
	requireAuth,
	requireRole(["owner", "manager"]),
	dailyReport
);
