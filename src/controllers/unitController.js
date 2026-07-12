import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Unit } from "../models/Unit.js";
import { AuditLog } from "../models/AuditLog.js";

function makeKey(name, businessId) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0,32)}-${businessId.slice(-4)}`;
}

async function listUnits(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, flat, page = 1, limit = 50, search } = req.query;
    const term = String(search || "").trim();
    const query = { businessId, isActive: true };
    const and = [];
    if (outletId) and.push({ $or: [{ outletId }, { outletId: null }] });
    if (term) {
      and.push({
        $or: [
          { name: { $regex: term, $options: "i" } },
          { abbreviation: { $regex: term, $options: "i" } },
          { key: { $regex: term, $options: "i" } }
        ]
      });
    }
    if (and.length) query.$and = and;

    if (flat === "true") {
      const numLimit = Number(limit);
      const numPage = Number(page);
      const units = await Unit.find(query).sort({ sortOrder: 1, name: 1 }).skip((numPage - 1) * numLimit).limit(numLimit).lean();
      const total = await Unit.countDocuments(query);
      const meta = {
        pagination: {
          page: numPage,
          limit: numLimit,
          total,
          totalPages: Math.ceil(total / numLimit)
        }
      };
      return successResponse({ res, message: "Units fetched successfully", data: units, meta });
    }

    const units = await Unit.find(query).sort({ sortOrder: 1, name: 1 }).lean();
    return successResponse({ res, data: { units } });
  } catch (error) {
    return next(error);
  }
}

async function createUnit(req, res, next) {
  try {
    const { businessId } = req.user;
    const { name, key, abbreviation, outletId, sortOrder } = req.body;
    const unitKey = key || makeKey(name, businessId);
    const unit = await Unit.create({ businessId, outletId: outletId || null, name, key: unitKey, abbreviation, sortOrder: sortOrder ?? 0 });
    await AuditLog.create({ businessId, actorId: req.user?.userId, module: "units", action: "create", targetType: "Unit", targetId: unit._id, targetName: unit.name, message: `Unit created: ${unit.name}`, ip: req.ip });
    return successResponse({ res, statusCode: 201, data: { unit } });
  } catch (error) {
    return next(error);
  }
}

async function updateUnit(req, res, next) {
  try {
    const { businessId } = req.user;
    const allowed = ["name", "key", "abbreviation", "sortOrder", "isActive"];
    const update = {};
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
    const unit = await Unit.findOneAndUpdate({ _id: req.params.id, businessId }, { $set: update }, { new: true });
    if (!unit) return errorResponse({ res, statusCode: 404, message: "Unit not found" });
    return successResponse({ res, data: { unit } });
  } catch (error) {
    return next(error);
  }
}

async function deleteUnit(req, res, next) {
  try {
    const { businessId } = req.user;
    await Unit.findOneAndUpdate({ _id: req.params.id, businessId }, { $set: { isActive: false } });
    return successResponse({ res, message: "Unit deactivated" });
  } catch (error) {
    return next(error);
  }
}

export { listUnits, createUnit, updateUnit, deleteUnit };
