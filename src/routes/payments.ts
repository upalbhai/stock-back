import { Router } from "express";
import { listPayments, paymentSummary } from "../controllers/paymentController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/roles.js";

export const paymentRouter = Router();

paymentRouter.get(
	"/",
	requireAuth,
	requireRole(["owner", "manager"]),
	listPayments
);
paymentRouter.get(
	"/summary",
	requireAuth,
	requireRole(["owner", "manager"]),
	paymentSummary
);
