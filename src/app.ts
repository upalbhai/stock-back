import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { outletRouter } from "./routes/outlets.js";
import { productRouter } from "./routes/products.js";
import { stockRouter } from "./routes/stock.js";
import { orderRouter } from "./routes/orders.js";
import { paymentRouter } from "./routes/payments.js";
import { reportRouter } from "./routes/reports.js";
import { errorHandler } from "./middlewares/error.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("dev"));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/outlets", outletRouter);
  app.use("/api/products", productRouter);
  app.use("/api/stock", stockRouter);
  app.use("/api/orders", orderRouter);
  app.use("/api/payments", paymentRouter);
  app.use("/api/reports", reportRouter);

  app.use(errorHandler);

  return app;
}
