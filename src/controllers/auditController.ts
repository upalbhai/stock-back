import type { Response, NextFunction } from "express";
import type { AuthedRequest } from "../middlewares/auth.js";
import { AuditLog } from "../models/AuditLog.js";

export async function listAuditLogs(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { businessId } = req.user!;
    const { outletId, actorId, module, action, from, to, page = 1, limit = 50 } = req.query;
    const query: Record<string, unknown> = { businessId };
    if (outletId) query.outletId = outletId;
    if (actorId) query.actorId = actorId;
    if (module) query.module = module;
    if (action) query.action = action;
    if (from || to) {
      query.createdAt = {};
      if (from) (query.createdAt as Record<string, unknown>).$gte = new Date(from as string);
      if (to) (query.createdAt as Record<string, unknown>).$lte = new Date(to as string);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      AuditLog.countDocuments(query)
    ]);
    return res.json({ logs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) { return next(error); }
}
