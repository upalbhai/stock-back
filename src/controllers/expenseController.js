import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Expense } from "../models/Expense.js";
import { AuditLog } from "../models/AuditLog.js";

function buildExpenseRecordStatusFilter(recordStatus) {
  if (recordStatus === "voided") return { status: "voided" };
  if (recordStatus === "all") return {};
  return { status: { $ne: "voided" } };
}

async function listExpenses(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, category, recordStatus = "active", from, to, page = 1, limit = 50 } = req.query;
    const query = { businessId, ...buildExpenseRecordStatusFilter(recordStatus) };
    if (outletId) query.outletId = outletId;
    if (category) query.category = category;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [expenses, total, stats] = await Promise.all([
      Expense.find(query)
        .sort({ date: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("createdBy", "name")
        .populate("voidedBy", "name")
        .lean(),
      Expense.countDocuments(query),
      Expense.aggregate([
        { $match: query },
        { 
          $group: { 
            _id: null, 
            totalAmount: { 
              $sum: { 
                $cond: [{ $eq: ["$status", "voided"] }, 0, "$amount"] 
              } 
            } 
          } 
        }
      ])
    ]);

    const totalAmount = stats[0]?.totalAmount || 0;

    return successResponse({
      res: res,
      data: {
        expenses,
        total,
        totalAmount,
        page: Number(page),
        pages: Math.ceil(total / Number(limit))
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
      date: date ? new Date(date) : new Date(),
      createdBy: userId
    });
    return successResponse({
      res: res,
      statusCode: 201,
      data: { expense }
    });
  } catch (error) {
    return next(error);
  }
}

async function voidExpense(req, res, next) {
  try {
    const { businessId, userId } = req.user;
    const { reason } = req.body;
    const expense = await Expense.findOne({ _id: req.params.id, businessId });
    if (!expense) {
      return errorResponse({ res, statusCode: 404, message: "Expense not found" });
    }
    if (expense.status === "voided") {
      return errorResponse({ res, statusCode: 400, message: "Already voided" });
    }

    await Expense.findByIdAndUpdate(expense._id, {
      status: "voided",
      voidedAt: new Date(),
      voidedBy: userId,
      voidReason: reason
    });

    await AuditLog.create({
      businessId,
      outletId: expense.outletId,
      actorId: userId,
      module: "expenses",
      action: "void",
      targetType: "Expense",
      targetId: expense._id,
      targetName: `${expense.category} — ${expense.amount}`,
      message: `Expense voided. Reason: ${reason}`,
      ip: req.ip
    });

    return successResponse({ res, message: "Expense voided" });
  } catch (error) {
    return next(error);
  }
}

export { createExpense, listExpenses, voidExpense };
