import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { corsOrigins, env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { businessRouter } from "./routes/businesses.js";
import { outletRouter } from "./routes/outlets.js";
import { categoryRouter } from "./routes/categories.js";
import { productRouter } from "./routes/products.js";
import { stockRouter } from "./routes/stock.js";
import { orderRouter } from "./routes/orders.js";
import { reportRouter } from "./routes/reports.js";
import { userRouter } from "./routes/users.js";
import { roleRouter } from "./routes/roles.js";
import { expenseRouter } from "./routes/expenses.js";
import { auditRouter } from "./routes/audit-logs.js";
import { adminRouter } from "./routes/admin.js";
import { planRouter } from "./routes/plans.js";
import { paymentRouter } from "./routes/payments.js";
import { errorHandler } from "./middlewares/error.js";
import { requireActiveSubscription } from "./middlewares/subscription.js";
function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (corsOrigins.includes(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  // 15 minutes
  max: 20,
  message: { message: "Too many login attempts. Try again later." }
});
function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true
  }));
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("dev"));
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app.use("/api/auth", authLimiter, authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/plans", planRouter);
  app.use("/api/payments", paymentRouter);
  
  // Subscription-protected routes
  app.use("/api/businesses", requireActiveSubscription, businessRouter);
  app.use("/api/outlets", requireActiveSubscription, outletRouter);
  app.use("/api/categories", requireActiveSubscription, categoryRouter);
  app.use("/api/products", requireActiveSubscription, productRouter);
  app.use("/api/stock", requireActiveSubscription, stockRouter);
  app.use("/api/orders", requireActiveSubscription, orderRouter);
  app.use("/api/reports", requireActiveSubscription, reportRouter);
  app.use("/api/expenses", requireActiveSubscription, expenseRouter);
  app.use("/api/users", requireActiveSubscription, userRouter);
  app.use("/api/roles", requireActiveSubscription, roleRouter);
  app.use("/api/audit-logs", requireActiveSubscription, auditRouter);
  
  app.use(errorHandler);
  return app;
}
export {
  createApp
};
