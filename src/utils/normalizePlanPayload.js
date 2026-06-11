import { ALL_FEATURE_KEYS, FEATURES } from "../config/features.js";

export function normalizePlanPayload(body = {}) {
  const payload = { ...body };

  if (Array.isArray(body.featureKeys)) {
    const featureKeys = body.featureKeys.filter((key) => ALL_FEATURE_KEYS.includes(key));
    payload.featureKeys = featureKeys;
    payload.features = featureKeys.map((key) => FEATURES[key]?.label).filter(Boolean);
  }

  return payload;
}
