import { Router } from "express";
import {
  listCustomers,
  createCustomer,
  getCustomer,
  updateCustomer,
  getCustomerLedger,
  recordCustomerPayment
} from "../controllers/customerController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { requireFeature } from "../middlewares/feature.js";
import { validate } from "../middlewares/validate.js";
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
  listCustomers
);
customerRouter.post(
  "/",
  requireAuth,
  requireFeature("customers"),
  requirePermission("customers", "create"),
  validate(customerCreateSchema),
  createCustomer
);
customerRouter.get(
  "/:id",
  requireAuth,
  requireFeature("customers"),
  requirePermission("customers", "read"),
  validate(idParamSchema, "params"),
  getCustomer
);
customerRouter.patch(
  "/:id",
  requireAuth,
  requireFeature("customers"),
  requirePermission("customers", "update"),
  validate(idParamSchema, "params"),
  validate(customerUpdateSchema),
  updateCustomer
);
customerRouter.get(
  "/:id/ledger",
  requireAuth,
  requireFeature("customers"),
  requirePermission("customers", "read"),
  validate(idParamSchema, "params"),
  getCustomerLedger
);
customerRouter.post(
  "/:id/payments",
  requireAuth,
  requireFeature("credit_khata"),
  requirePermission("customers", "collect"),
  validate(idParamSchema, "params"),
  validate(customerPaymentSchema),
  recordCustomerPayment
);

export { customerRouter };
