import { Router } from "express";
import { listInvoices, getInvoice, generateInvoice } from "../controllers/invoiceController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { requireFeature } from "../middlewares/feature.js";
import { validate } from "../middlewares/validate.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";
import { idParamSchema } from "../validators/schemas.js";

const invoiceRouter = Router();

invoiceRouter.get(
  "/",
  requireAuth,
  requireFeature("gst_invoices"),
  requirePermission("invoices", "read"),
  rateLimit("invoices"),
  listInvoices
);
invoiceRouter.get(
  "/:id",
  requireAuth,
  requireFeature("gst_invoices"),
  requirePermission("invoices", "read"),
  rateLimit("invoices"),
  validate(idParamSchema, "params"),
  getInvoice
);
invoiceRouter.post(
  "/:id/generate",
  requireAuth,
  requireFeature("gst_invoices"),
  requirePermission("invoices", "create"),
  rateLimit("invoices"),
  validate(idParamSchema, "params"),
  generateInvoice
);

export { invoiceRouter };
