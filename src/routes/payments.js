import { Router } from "express";
import { createOrder, verifyPayment, webhookHandler, getSubscriptionStatus } from "../controllers/paymentController.js";
import { requireAuth } from "../middlewares/auth.js";

const paymentRouter = Router();

// Webhook must use raw body parser depending on how it's mounted, 
// usually express.raw() is better, but since app.js uses express.json() we'll parse it there or keep it simple.
// In a real prod setup, Razorpay webhook needs the raw body to verify signature.
paymentRouter.post("/webhook", webhookHandler);

// Protected routes
paymentRouter.use(requireAuth);
paymentRouter.post("/create-order", createOrder);
paymentRouter.post("/verify", verifyPayment);
paymentRouter.get("/status", getSubscriptionStatus);

export { paymentRouter };
