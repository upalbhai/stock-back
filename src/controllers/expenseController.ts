import type { Response, NextFunction } from "express";
import type { AuthedRequest } from "../middlewares/auth.js";
import { Expense } from "../models/Expense.js";

export async function listExpenses(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { businessId } = req.user!;
    const { outletId, category, from, to, page = 1, limit = 50 } = req.query;
    const query: Record<string, unknown> = { businessId };
    if (outletId) query.outletId = outletId;
    if (category) query.category = category;
    if (from || to) {
      query.date = {};
      if (from) (query.date as Record<string, unknown>).$gte = new Date(from as string);
      if (to) (query.date as Record<string, unknown>).$lte = new Date(to as string);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [expenses, total] = await Promise.all([
      Expense.find(query).sort({ date: -1 }).skip(skip).limit(Number(limit))
        .populate("createdBy", "name").lean(),
      Expense.countDocuments(query)
    ]);
    const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);
    return res.json({ expenses, total, totalAmount });
  } catch (error) { return next(error); }
}

export async function createExpense(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { businessId, userId } = req.user!;
    const { outletId, category, amount, note, date } = req.body;
    const expense = await Expense.create({
      businessId, outletId, category, amount, note,
      date: date ? new Date(date) : new Date(), createdBy: userId
    });
    return res.status(201).json({ expense });
  } catch (error) { return next(error); }
}

export async function deleteExpense(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { businessId } = req.user!;
    await Expense.findOneAndDelete({ _id: req.params.id, businessId });
    return res.json({ message: "Expense deleted" });
  } catch (error) { return next(error); }
}
