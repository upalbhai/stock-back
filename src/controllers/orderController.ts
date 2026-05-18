import type { Request, Response, NextFunction } from "express";
import { Order } from "../models/Order.js";
import { Payment } from "../models/Payment.js";
import { Product } from "../models/Product.js";

export async function createOrder(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { outletId, items, payment, createdBy } = req.body;

    const normalizedItems = items.map(
      (item: { productId: string; name: string; qty: number; price: number; taxRate?: number }) => {
        const taxRate = item.taxRate ?? 0;
        const lineTotal = item.price * item.qty;
        const taxTotal = lineTotal * taxRate;
        return {
          productId: item.productId,
          name: item.name,
          qty: item.qty,
          price: item.price,
          taxRate,
          lineTotal,
          taxTotal
        };
      }
    );

    const subtotal = normalizedItems.reduce(
      (sum: number, item: { lineTotal: number }) => sum + item.lineTotal,
      0
    );
    const tax = normalizedItems.reduce(
      (sum: number, item: { taxTotal: number }) => sum + item.taxTotal,
      0
    );
    const total = subtotal + tax;

    const order = await Order.create({
      outletId,
      items: normalizedItems,
      subtotal,
      tax,
      total,
      createdBy
    });

    await Promise.all(
      normalizedItems.map((item: { productId: string; qty: number }) =>
        Product.findByIdAndUpdate(item.productId, {
          $inc: { onHandQty: -item.qty }
        })
      )
    );

    const method = payment?.method ?? "cash";
    const cash = payment?.cash ?? 0;
    const online = payment?.online ?? 0;
    const card = payment?.card ?? 0;
    const amount = method === "split" ? cash + online + card : total;

    await Payment.create({
      outletId,
      orderId: order._id,
      method,
      amount,
      split: { cash, online, card },
      receivedBy: createdBy
    });

    res.status(201).json({ data: order });
  } catch (error) {
    next(error);
  }
}

export async function listOrders(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { outletId } = req.query;
    const orders = await Order.find({ outletId }).sort({ createdAt: -1 }).lean();
    res.json({ data: orders });
  } catch (error) {
    next(error);
  }
}
