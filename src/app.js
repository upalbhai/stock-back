import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { corsOrigins, env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import blogRouter from "./routes/blogs.js";
import agentRouter from "./routes/agent.js";
import { businessRouter } from "./routes/businesses.js";
import { outletRouter } from "./routes/outlets.js";
import { categoryRouter } from "./routes/categories.js";
import { brandRouter } from "./routes/brands.js";
import { unitRouter } from "./routes/units.js";
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
import { featureRouter } from "./routes/features.js";
import { customerRouter } from "./routes/customers.js";
import { invoiceRouter } from "./routes/invoices.js";
import { printRouter } from "./routes/print.js";
import { errorHandler } from "./middlewares/error.js";
import { requireActiveSubscription } from "./middlewares/subscription.js";
import { requireAuth } from "./middlewares/auth.js";
import { loadBusinessContext } from "./middlewares/feature.js";
import { notificationRouter } from "./routes/notifications.js";
function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (corsOrigins.includes(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}
function createApp() {
  const app = express();
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));
  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("dev"));

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: /* @__PURE__ */ new Date().toISOString(),
    });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/agent", agentRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/plans", planRouter);
  app.use("/api/payments", paymentRouter);
  app.use("/api/features", featureRouter);
  app.use("/api/blogs", blogRouter);

  const withSub = [requireAuth, requireActiveSubscription, loadBusinessContext];

  // Subscription-protected routes
  app.use("/api/businesses", ...withSub, businessRouter);
  app.use("/api/outlets", ...withSub, outletRouter);
  app.use("/api/categories", ...withSub, categoryRouter);
  app.use("/api/brands", ...withSub, brandRouter);
  app.use("/api/units", ...withSub, unitRouter);
  app.use("/api/products", ...withSub, productRouter);
  app.use("/api/stock", ...withSub, stockRouter);
  app.use("/api/orders", ...withSub, orderRouter);
  app.use("/api/customers", ...withSub, customerRouter);
  app.use("/api/invoices", ...withSub, invoiceRouter);
  app.use("/api/reports", ...withSub, reportRouter);
  app.use("/api/expenses", ...withSub, expenseRouter);
  app.use("/api/users", ...withSub, userRouter);
  app.use("/api/roles", ...withSub, roleRouter);
  app.use("/api/audit-logs", ...withSub, auditRouter);
  app.use("/api/print", ...withSub, printRouter);
  app.use("/api/notifications", ...withSub, notificationRouter);

  app.use(errorHandler);
  return app;
}
export { createApp };
