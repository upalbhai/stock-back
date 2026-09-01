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
    if (outletId) {
      query.$or = [{ outletId }, { outletId: null }];
    }
    
    if (term) {
      // Using $or for outletId and search at the same time requires $and,
      // but if outletId is not present, we can just use $or directly
      const searchOr = {
        $or: [
          { name: { $regex: term, $options: "i" } },
          { abbreviation: { $regex: term, $options: "i" } },
          { key: { $regex: term, $options: "i" } }
        ]
      };
      
      if (query.$or) {
        query.$and = [ { $or: query.$or }, searchOr ];
        delete query.$or;
      } else {
        query.$or = searchOr.$or;
      }
    }

    if (flat === "true") {
      const numLimit = Math.min(Number(limit) || 50, 500);
      const numPage = Math.max(Number(page) || 1, 1);
      const skip = (numPage - 1) * numLimit;

      const [total, units] = await Promise.all([
        Unit.countDocuments(query),
        Unit.find(query)
          .sort({ sortOrder: 1, name: 1 })
          .skip(skip)
          .limit(numLimit)
          .lean()
      ]);

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
    const unit = await Unit.findOne({ _id: req.params.id, businessId });
    if (!unit) return errorResponse({ res, statusCode: 404, message: "Unit not found" });
    
    unit.isActive = false;
    unit.key = `${unit.key}-deleted-${Date.now()}`;
    await unit.save();

    return successResponse({ res, message: "Unit deactivated" });
  } catch (error) {
    return next(error);
  }
}

export { listUnits, createUnit, updateUnit, deleteUnit };
