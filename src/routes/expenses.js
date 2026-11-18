import { Router } from "express";
import { listExpenses, createExpense, voidExpense } from "../controllers/expenseController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";
import { expenseCreateSchema, idParamSchema, voidRecordSchema } from "../validators/schemas.js";

const expenseRouter = Router();

expenseRouter.get("/", requireAuth, requirePermission("expenses", "read"), rateLimit("expenseCrud"), listExpenses);
expenseRouter.post("/", requireAuth, requirePermission("expenses", "create"), rateLimit("expenseCrud"), validate(expenseCreateSchema), createExpense);
expenseRouter.post("/:id/void", requireAuth, requirePermission("expenses", "void"), rateLimit("expenseCrud"), validate(idParamSchema, "params"), validate(voidRecordSchema), voidExpense);

export { expenseRouter };
