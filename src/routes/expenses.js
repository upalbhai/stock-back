import { Router } from "express";
import { listExpenses, createExpense, voidExpense } from "../controllers/expenseController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { expenseCreateSchema, idParamSchema, voidRecordSchema } from "../validators/schemas.js";
const expenseRouter = Router();
expenseRouter.get("/", requireAuth, requirePermission("expenses", "read"), listExpenses);
expenseRouter.post("/", requireAuth, requirePermission("expenses", "create"), validate(expenseCreateSchema), createExpense);
expenseRouter.post("/:id/void", requireAuth, requirePermission("expenses", "void"), validate(idParamSchema, "params"), validate(voidRecordSchema), voidExpense);
export {
  expenseRouter
};
