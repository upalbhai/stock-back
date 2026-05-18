import type { Request, Response, NextFunction } from "express";
import { Order } from "../models/Order.js";
import { Payment } from "../models/Payment.js";
import { Product } from "../models/Product.js";
import { getDayRange } from "../utils/date.js";

export async function dailyReport(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { outletId, date } = req.query;
    const { start, end } = getDayRange(date as string | undefined);

    const orders = await Order.find({
      outletId,
      createdAt: { $gte: start, $lte: end }
    }).lean();

    const payments = await Payment.find({
      outletId,
      createdAt: { $gte: start, $lte: end }
    }).lean();

    const totalSales = orders.reduce((sum, order) => sum + order.total, 0);
    const totalOrders = orders.length;

    const paymentSummary = {
      cash: 0,
      online: 0,
      card: 0,
      split: 0
    };

    payments.forEach((payment) => {
      if (payment.method === "split") {
        paymentSummary.cash += payment.split?.cash || 0;
        paymentSummary.online += payment.split?.online || 0;
        paymentSummary.card += payment.split?.card || 0;
        paymentSummary.split += payment.amount;
        return;
      }
      if (payment.method === "cash") {
        paymentSummary.cash += payment.amount;
      }
      if (payment.method === "online") {
        paymentSummary.online += payment.amount;
      }
      if (payment.method === "card") {
        paymentSummary.card += payment.amount;
      }
    });

    const productTotals = new Map<string, number>();
    orders.forEach((order) => {
      order.items.forEach((item) => {
        productTotals.set(item.name, (productTotals.get(item.name) || 0) + item.qty);
      });
    });

    const bestSelling = Array.from(productTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ name, qty }));

    const remainingStock = await Product.find({ outletId })
      .select("name onHandQty")
      .lean();

    res.json({
      data: {
        totalSales,
        totalOrders,
        paymentSummary,
        bestSelling,
        remainingStock
      }
    });
  } catch (error) {
    next(error);
  }
}
