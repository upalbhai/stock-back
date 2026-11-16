import { Router } from "express";
import {
  listCustomers,
  createCustomer,
  getCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerLedger,
  recordCustomerPayment
} from "../controllers/customerController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { requireFeature } from "../middlewares/feature.js";
import { validate } from "../middlewares/validate.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";
import {
  idParamSchema,
  customerCreateSchema,
  customerUpdateSchema,
  customerPaymentSchema
} from "../validators/schemas.js";

const customerRouter = Router();

customerRouter.get(
  "/",
  requireAuth,
  requireFeature("customers"),
  requirePermission("customers", "read"),
  rateLimit("customerCrud"),
  listCustomers
);
customerRouter.post(
  "/",
  requireAuth,
  requireFeature("customers"),
  requirePermission("customers", "create"),
  rateLimit("customerCrud"),
  validate(customerCreateSchema),
  createCustomer
);
customerRouter.get(
  "/:id",
  requireAuth,
  requireFeature("customers"),
  requirePermission("customers", "read"),
  rateLimit("customerCrud"),
  validate(idParamSchema, "params"),
  getCustomer
);
customerRouter.patch(
  "/:id",
  requireAuth,
  requireFeature("customers"),
  requirePermission("customers", "update"),
  rateLimit("customerCrud"),
  validate(idParamSchema, "params"),
  validate(customerUpdateSchema),
  updateCustomer
);
customerRouter.delete(
  "/:id",
  requireAuth,
  requireFeature("customers"),
  requirePermission("customers", "delete"),
  rateLimit("customerCrud"),
  validate(idParamSchema, "params"),
  deleteCustomer
);
customerRouter.get(
  "/:id/ledger",
  requireAuth,
  requireFeature("customers"),
  requirePermission("customers", "read"),
  rateLimit("customerCrud"),
  validate(idParamSchema, "params"),
  getCustomerLedger
);
customerRouter.post(
  "/:id/payments",
  requireAuth,
  requireFeature("credit_khata"),
  requirePermission("customers", "collect"),
  rateLimit("customerCrud"),
  validate(idParamSchema, "params"),
  validate(customerPaymentSchema),
  recordCustomerPayment
);

export { customerRouter };
