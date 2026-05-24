import { Plan } from "../models/Plan.js";
import { AuditLog } from "../models/AuditLog.js";

function makeSlug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function listPlans(req, res, next) {
  try {
    const plans = await Plan.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
    return res.json({ plans });
  } catch (error) {
    return next(error);
  }
}

async function listAllPlans(req, res, next) {
  try {
    const plans = await Plan.find().sort({ sortOrder: 1 }).lean();
    return res.json({ plans });
  } catch (error) {
    return next(error);
  }
}

async function createPlan(req, res, next) {
  try {
    const { name, ...rest } = req.body;
    const slug = makeSlug(name);
    
    const existing = await Plan.findOne({ slug });
    if (existing) {
      return res.status(400).json({ message: "Plan with this name already exists" });
    }
    
    const plan = await Plan.create({ name, slug, ...rest });
    
    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "create_plan",
      message: `Created plan: ${plan.name}`,
      ip: req.ip
    });
    
    return res.status(201).json({ plan });
  } catch (error) {
    return next(error);
  }
}

async function updatePlan(req, res, next) {
  try {
    const plan = await Plan.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    
    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "update_plan",
      message: `Updated plan: ${plan.name}`,
      ip: req.ip
    });
    
    return res.json({ plan });
  } catch (error) {
    return next(error);
  }
}

async function deletePlan(req, res, next) {
  try {
    const plan = await Plan.findByIdAndDelete(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    
    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "delete_plan",
      message: `Deleted plan: ${plan.name}`,
      ip: req.ip
    });
    
    return res.json({ message: "Plan deleted" });
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
