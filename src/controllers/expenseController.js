import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Expense } from "../models/Expense.js";
async function listExpenses(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, category, from, to, page = 1, limit = 50 } = req.query;
    const query = { businessId };
    if (outletId) query.outletId = outletId;
    if (category) query.category = category;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [expenses, total] = await Promise.all([
      Expense.find(query).sort({ date: -1 }).skip(skip).limit(Number(limit)).populate("createdBy", "name").lean(),
      Expense.countDocuments(query)
    ]);
    const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);
    return successResponse({
      res: res,

      data: {
        expenses,
        total,
        totalAmount
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function createExpense(req, res, next) {
  try {
    const { businessId, userId } = req.user;
    const { outletId, category, amount, note, date } = req.body;
    const expense = await Expense.create({
      businessId,
      outletId,
      category,
      amount,
      note,
      date: date ? new Date(date) : /* @__PURE__ */ new Date(),
      createdBy: userId
    });
    return successResponse({
      res: res,
      statusCode: 201,

      data: {
        expense
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function deleteExpense(req, res, next) {
  try {
    const { businessId } = req.user;
    await Expense.findOneAndDelete({ _id: req.params.id, businessId });
    return successResponse({
      res: res,
      message: "Expense deleted"
    });
  } catch (error) {
    return next(error);
  }
}
export {
  createExpense,
  deleteExpense,
  listExpenses
};
