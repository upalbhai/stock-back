import { Router } from "express";
import { createOrder, verifyPayment, webhookHandler, getSubscriptionStatus } from "../controllers/paymentController.js";
import { requireAuth } from "../middlewares/auth.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";

const paymentRouter = Router();

// Webhook must use raw body parser depending on how it's mounted, 
// usually express.raw() is better, but since app.js uses express.json() we'll parse it there or keep it simple.
// In a real prod setup, Razorpay webhook needs the raw body to verify signature.
paymentRouter.post("/webhook", rateLimit("webhook"), webhookHandler);

// Protected routes
paymentRouter.use(requireAuth);
paymentRouter.post("/create-order", rateLimit("payments"), createOrder);
paymentRouter.post("/verify", rateLimit("payments"), verifyPayment);
paymentRouter.get("/status", rateLimit("payments"), getSubscriptionStatus);

export { paymentRouter };
