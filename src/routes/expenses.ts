import { Router } from "express";
import { listExpenses, createExpense, deleteExpense } from "../controllers/expenseController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";

export const expenseRouter = Router();
expenseRouter.get("/", requireAuth, requirePermission("expenses", "read"), listExpenses);
expenseRouter.post("/", requireAuth, requirePermission("expenses", "create"), createExpense);
expenseRouter.delete("/:id", requireAuth, requirePermission("expenses", "delete"), deleteExpense);
