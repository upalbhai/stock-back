import { Router } from "express";
import { listPayments, paymentSummary } from "../controllers/paymentController.js";
import { requireAuth } from "../middlewares/auth.js";

export const paymentRouter = Router();

paymentRouter.get("/", requireAuth, listPayments);
paymentRouter.get("/summary", requireAuth, paymentSummary);
