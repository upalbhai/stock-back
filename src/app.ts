import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
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
import { errorHandler } from "./middlewares/error.js";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { message: "Too many login attempts. Try again later." }
});

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("dev"));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Rate limit auth routes
  app.use("/api/auth", authLimiter, authRouter);

  // Business & multi-outlet
  app.use("/api/businesses", businessRouter);
  app.use("/api/outlets", outletRouter);

  // Catalog
  app.use("/api/categories", categoryRouter);
  app.use("/api/products", productRouter);

  // Operations
  app.use("/api/stock", stockRouter);
  app.use("/api/orders", orderRouter);
  app.use("/api/reports", reportRouter);
  app.use("/api/expenses", expenseRouter);

  // User & role management
  app.use("/api/users", userRouter);
  app.use("/api/roles", roleRouter);

  // Audit & admin
  app.use("/api/audit-logs", auditRouter);
  app.use("/api/admin", adminRouter);

  app.use(errorHandler);

  return app;
}
