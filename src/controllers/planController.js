import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Plan } from "../models/Plan.js";
import { AuditLog } from "../models/AuditLog.js";
import { normalizePlanPayload } from "../utils/normalizePlanPayload.js";

function makeSlug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function listPlans(req, res, next) {
  try {
    const plans = await Plan.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
    return successResponse({
      res: res,

      data: {
        plans
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function listAllPlans(req, res, next) {
  try {
    const plans = await Plan.find().sort({ sortOrder: 1 }).lean();
    return successResponse({
      res: res,

      data: {
        plans
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function createPlan(req, res, next) {
  try {
    const { name, ...rest } = req.body;
    const slug = makeSlug(name);
    const payload = normalizePlanPayload(rest);

    const existing = await Plan.findOne({ slug });
    if (existing) {
      return errorResponse({
        res: res,
        statusCode: 400,
        message: "Plan with this name already exists"
      });
    }
    
    const plan = await Plan.create({ name, slug, ...payload });
    
    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "create_plan",
      message: `Created plan: ${plan.name}`,
      ip: req.ip
    });
    
    return successResponse({
      res: res,
      statusCode: 201,

      data: {
        plan
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function updatePlan(req, res, next) {
  try {
    const plan = await Plan.findByIdAndUpdate(
      req.params.id,
      { $set: normalizePlanPayload(req.body) },
      { new: true }
    );
    if (!plan) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Plan not found"
    });
    
    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "update_plan",
      message: `Updated plan: ${plan.name}`,
      ip: req.ip
    });
    
    return successResponse({
      res: res,

      data: {
        plan
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function deletePlan(req, res, next) {
  try {
    const plan = await Plan.findByIdAndDelete(req.params.id);
    if (!plan) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Plan not found"
    });
    
    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "delete_plan",
      message: `Deleted plan: ${plan.name}`,
      ip: req.ip
    });
    
    return successResponse({
      res: res,
      message: "Plan deleted"
    });
  } catch (error) {
    return next(error);
  }
}

export {
  listPlans,
  listAllPlans,
  createPlan,
  updatePlan,
  deletePlan
};
