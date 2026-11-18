import { Business } from "../models/Business.js";
import {
  getFeatureKeysForPlan,
  resolveBusinessFeatures,
  resolveBusinessProfile
} from "../config/features.js";

export function buildPlanBusinessUpdate(plan) {
  const featureKeys = getFeatureKeysForPlan(plan);
  const planType = plan.planType || "retail";
  return {
    planId: plan._id,
    planType,
    businessProfile: planType,
    enabledFeatures: featureKeys,
    maxOutlets: plan.maxOutlets,
    maxStaff: plan.maxStaff,
    maxProducts: plan.maxProducts
  };
}

export async function applyPlanToBusiness(businessId, plan, extraFields = {}) {
  const update = { ...buildPlanBusinessUpdate(plan), ...extraFields };
  return Business.findByIdAndUpdate(businessId, { $set: update }, { new: true });
}

export function getBusinessContextFromDoc(business, plan) {
  return {
    enabledFeatures: resolveBusinessFeatures(business),
    businessProfile: resolveBusinessProfile(business, plan),
    planType: business?.planType || plan?.planType || "retail"
  };
}
