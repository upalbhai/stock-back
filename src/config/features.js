export const PLAN_TYPES = ["retail", "wholesale", "hybrid"];

export const FEATURES = {
  retail_billing: {
    key: "retail_billing",
    label: "Retail POS",
    group: "billing",
    description: "Quick counter billing, takeaway, dine-in"
  },
  wholesale_billing: {
    key: "wholesale_billing",
    label: "Wholesale Billing",
    group: "billing",
    description: "Bulk billing in peti/crate with manual pricing"
  },
  packaging_units: {
    key: "packaging_units",
    label: "Packaging Units",
    group: "products",
    description: "Peti/crate packaging on products"
  },
  notifications: {
    key: "notifications",
    label: "Notifications",
    group: "communication",
    description: "Real-time in-app notifications for orders, stock alerts, etc."
  },
  credit_khata: {
    key: "credit_khata",
    label: "Credit / Khata",
    group: "customers",
    description: "Partial payments and customer dues"
  },
  customers: {
    key: "customers",
    label: "Customer Directory",
    group: "customers",
    description: "Saved customers with GSTIN and balance"
  },
  gst_invoices: {
    key: "gst_invoices",
    label: "GST Invoices",
    group: "billing",
    description: "CGST/SGST invoice generation"
  },
  bulk_stock_in: {
    key: "bulk_stock_in",
    label: "Bulk Stock Receive",
    group: "inventory",
    description: "Receive stock in peti/crate units"
  },
  order_void: {
    key: "order_void",
    label: "Void Bills",
    group: "billing",
    description: "Void wrong entries while keeping audit trail"
  },
  order_history: {
    key: "order_history",
    label: "Order History",
    group: "billing",
    description: "View and reprint past bills"
  }
};

export const PLAN_FEATURE_TEMPLATES = {
  retail: ["retail_billing", "order_void", "order_history", "notifications"],
  wholesale: [
    "wholesale_billing",
    "packaging_units",
    "bulk_stock_in",
    "credit_khata",
    "customers",
    "gst_invoices",
    "order_void",
    "order_history",
    "notifications"
  ],
  hybrid: [
    "retail_billing",
    "wholesale_billing",
    "packaging_units",
    "bulk_stock_in",
    "credit_khata",
    "customers",
    "gst_invoices",
    "order_void",
    "order_history",
    "notifications"
  ]
};

export const ALL_FEATURE_KEYS = Object.keys(FEATURES);

export function listFeaturesRegistry() {
  return Object.values(FEATURES);
}

export function getFeatureKeysForPlan(plan) {
  if (!plan) return PLAN_FEATURE_TEMPLATES.retail;
  if (plan.featureKeys?.length) return plan.featureKeys;
  if (plan.planType && PLAN_FEATURE_TEMPLATES[plan.planType]) {
    return PLAN_FEATURE_TEMPLATES[plan.planType];
  }
  return PLAN_FEATURE_TEMPLATES.hybrid;
}

export function resolveBusinessFeatures(business) {
  if (business?.enabledFeatures?.length) return business.enabledFeatures;
  if (business?.planType && PLAN_FEATURE_TEMPLATES[business.planType]) {
    return PLAN_FEATURE_TEMPLATES[business.planType];
  }
  return PLAN_FEATURE_TEMPLATES.hybrid;
}

export function resolveBusinessProfile(business, plan) {
  if (business?.businessProfile) return business.businessProfile;
  if (plan?.planType) return plan.planType;
  return "retail";
}
