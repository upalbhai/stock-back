import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
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
    const numLimit = Number(limit);
    
    // Support cursor-based pagination
    const { cursor } = req.query;
    if (cursor) {
      query._id = { $lt: cursor }; // For sorting by createdAt descending, _id also descends
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ _id: -1 })
        .skip(cursor ? 0 : skip)
        .limit(numLimit)
        .lean(),
      cursor ? 0 : AuditLog.countDocuments(query) // Only count if using offset pagination
    ]);

    let meta = null;
    if (cursor !== undefined) {
      // Cursor pagination meta
      const hasNextPage = logs.length === numLimit;
      const nextCursor = hasNextPage ? logs[logs.length - 1]._id : null;
      meta = {
        cursor: {
          nextCursor,
          hasNextPage
        }
      };
    } else {
      // Standard offset pagination meta
      meta = {
        pagination: {
          page: Number(page),
          limit: numLimit,
          total,
          totalPages: Math.ceil(total / numLimit)
        }
      };
    }

    return successResponse({
      res: res,
      message: "Audit logs fetched successfully",
      data: logs,
      meta
    });
  } catch (error) {
    return next(error);
  }
}
export {
  listAuditLogs
};
