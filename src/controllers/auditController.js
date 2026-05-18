import { AuditLog } from "../models/AuditLog.js";
async function listAuditLogs(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, actorId, module, action, from, to, page = 1, limit = 50 } = req.query;
    const query = { businessId };
    if (outletId) query.outletId = outletId;
    if (actorId) query.actorId = actorId;
    if (module) query.module = module;
    if (action) query.action = action;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      AuditLog.countDocuments(query)
    ]);
    return res.json({ logs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    return next(error);
  }
}
export {
  listAuditLogs
};
