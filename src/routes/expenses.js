import { Router } from "express";
import { listExpenses, createExpense, deleteExpense } from "../controllers/expenseController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { expenseCreateSchema, idParamSchema } from "../validators/schemas.js";
const expenseRouter = Router();
expenseRouter.get("/", requireAuth, requirePermission("expenses", "read"), listExpenses);
expenseRouter.post("/", requireAuth, requirePermission("expenses", "create"), validate(expenseCreateSchema), createExpense);
expenseRouter.delete("/:id", requireAuth, requirePermission("expenses", "delete"), validate(idParamSchema, "params"), deleteExpense);
export {
  expenseRouter
};
