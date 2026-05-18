import { Payment } from "../models/Payment.js";
import { getDayRange } from "../utils/date.js";
async function listPayments(req, res, next) {
  try {
    const { outletId } = req.query;
    const payments = await Payment.find({ outletId }).sort({ createdAt: -1 }).lean();
    res.json({ data: payments });
  } catch (error) {
    next(error);
  }
}
async function paymentSummary(req, res, next) {
  try {
    const { outletId, date } = req.query;
    const { start, end } = getDayRange(date);
    const payments = await Payment.find({
      outletId,
      createdAt: { $gte: start, $lte: end }
    }).lean();
    const summary = {
      cash: 0,
      online: 0,
      card: 0,
      split: 0
    };
    payments.forEach((payment) => {
      if (payment.method === "split") {
        summary.cash += payment.split?.cash || 0;
        summary.online += payment.split?.online || 0;
        summary.card += payment.split?.card || 0;
        summary.split += payment.amount;
        return;
      }
      if (payment.method === "cash") {
        summary.cash += payment.amount;
      }
      if (payment.method === "online") {
        summary.online += payment.amount;
      }
      if (payment.method === "card") {
        summary.card += payment.amount;
      }
    });
    res.json({ data: summary });
  } catch (error) {
    next(error);
  }
}
export {
  listPayments,
  paymentSummary
};
