import { successResponse } from "../utils/successResponse.js";
import {
  listFeaturesRegistry,
  PLAN_FEATURE_TEMPLATES,
  PLAN_TYPES
} from "../config/features.js";

async function listFeatures(req, res, next) {
  try {
    return successResponse({
      res,
      data: {
        features: listFeaturesRegistry(),
        planTypes: PLAN_TYPES,
        planFeatureTemplates: PLAN_FEATURE_TEMPLATES
      }
    });
  } catch (error) {
    return next(error);
  }
}

export { listFeatures };
