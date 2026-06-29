import { z } from "zod";

export const emailSchema = z.string().trim().email("Enter a valid email address");
export const phoneSchema = z.string().trim().min(8, "Enter a valid phone number").max(16, "Enter a valid phone number");
export const passwordSchema = z.string().min(6, "Password must be at least 6 characters").max(128);

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  email: emailSchema,
  password: passwordSchema.optional(),
  phone: phoneSchema.optional(),
  businessName: z.string().trim().min(2, "Business name is required"),
  outletName: z.string().trim().min(2).optional(),
  outletId: z.string().trim().optional()
});

// Email + Password login
export const emailLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema
});

// Password reset
export const forgotPasswordSchema = z.object({
  email: emailSchema
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: z.string().trim().min(4).max(8),
  newPassword: passwordSchema
});

export const setupPasswordSchema = z.object({
  newPassword: passwordSchema,
  oldPassword: passwordSchema.optional()
});

export const otpEmailSchema = z.object({
  email: emailSchema
});

export const otpVerifySchema = z.object({
  email: emailSchema,
  code: z.string().trim().min(4, "Code is required").max(8, "Code is invalid")
});

export const businessUpdateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  timezone: z.string().trim().min(1).optional(),
  currency: z.string().trim().min(1).optional(),
  logo: z.string().trim().url().optional().or(z.literal("")),
  address: z.string().trim().optional(),
  gstNumber: z.string().trim().optional(),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  settings: z.object({
    requireCustomerName: z.boolean().optional(),
    enableOnlineOrders: z.boolean().optional(),
    defaultTaxRate: z.number().min(0).max(100).optional()
  }).partial().optional()
});

export const outletCreateSchema = z.object({
  name: z.string().trim().min(2, "Outlet name is required"),
  address: z.string().trim().optional(),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  taxEnabled: z.boolean().optional(),
  defaultTaxRate: z.number().min(0).max(100).optional(),
  billingModes: z.array(z.enum(["takeaway", "dine_in", "parcel", "quick"])).optional(),
  settings: z.object({
    enableUPI: z.boolean().optional(),
    enableCard: z.boolean().optional(),
    enableCash: z.boolean().optional(),
    enableWallet: z.boolean().optional(),
    requireCustomerName: z.boolean().optional(),
    printReceiptDefault: z.boolean().optional()
  }).partial().optional()
});

export const outletUpdateSchema = outletCreateSchema.extend({
  managerId: z.string().trim().optional(),
  isActive: z.boolean().optional()
}).partial();

export const userCreateSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  phone: phoneSchema,
  email: emailSchema.optional(),
  password: passwordSchema,
  role: z.enum(["superadmin", "owner", "manager", "staff"]).optional(),
  roleId: z.string().trim().optional().nullable(),
  outletIds: z.array(z.string().trim()).optional()
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: emailSchema.optional(),
  role: z.enum(["superadmin", "owner", "manager", "staff"]).optional(),
  roleId: z.string().trim().optional().nullable(),
  outletIds: z.array(z.string().trim()).optional(),
  isActive: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  password: passwordSchema.optional()
});

export const inviteCreateSchema = z.object({
  outletIds: z.array(z.string().trim()).optional(),
  roleId: z.string().trim().optional(),
  role: z.enum(["manager", "staff"]).optional(),
  name: z.string().trim().min(2).optional(),
  phone: phoneSchema.optional(),
  email: emailSchema.optional()
});

export const inviteAcceptSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  password: passwordSchema
});

export const roleCreateSchema = z.object({
  name: z.string().trim().min(2, "Role name is required"),
  description: z.string().trim().optional(),
  permissions: z.array(z.object({
    module: z.string().trim().min(1),
    actions: z.array(z.string().trim().min(1)).default([])
  })).optional(),
  outletScope: z.enum(["all", "restricted"]).optional(),
  outletIds: z.array(z.string().trim()).optional()
});

export const roleUpdateSchema = roleCreateSchema.partial();

export const adminStatusSchema = z.object({
  status: z.enum(["pending", "active", "suspended", "banned"])
});

export const adminPlanSchema = z.object({
  plan: z.enum(["free", "starter", "pro", "enterprise"]).optional(),
  planId: z.string().optional(),
  planExpiresAt: z.string().datetime().optional().or(z.date().optional()),
  maxOutlets: z.number().int().min(1).optional(),
  subscriptionStatus: z.enum(["trial", "active", "expired", "cancelled"]).optional(),
  currentPeriodEnd: z.string().datetime().optional().or(z.date().optional()),
});

export const adminImpersonateSchema = z.object({
  targetUserId: z.string().trim().min(1, "Target user is required")
});

export const idParamSchema = z.object({
  id: z.string().trim().min(1, "ID is required")
});

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(2, "Category name is required"),
  parentId: z.string().trim().optional().nullable(),
  outletId: z.string().trim().optional().nullable(),
  icon: z.string().trim().optional(),
  color: z.string().trim().optional(),
  image: z.string().trim().optional(),
  sortOrder: z.number().int().optional(),
  description: z.string().trim().optional()
}).passthrough();

export const categoryUpdateSchema = categoryCreateSchema.partial().passthrough();

export const unitCreateSchema = z.object({
  name: z.string().trim().min(1, "Unit name is required"),
  key: z.string().trim().optional(),
  abbreviation: z.string().trim().optional(),
  outletId: z.string().trim().optional().nullable(),
  sortOrder: z.number().int().optional()
}).passthrough();

export const unitUpdateSchema = unitCreateSchema.partial().passthrough();

const packagingUnitSchema = z.object({
  unitId: z.string().trim().min(1),
  qtyPerUnit: z.number().positive(),
  price: z.number().min(0).optional(),
  costPrice: z.number().min(0).optional(),
  isActive: z.boolean().optional()
});

export const productCreateSchema = z.object({
  outletId: z.string().trim().min(1, "Outlet is required"),
  name: z.string().trim().min(2, "Product name is required"),
  unit: z.string().trim().optional(),
  unitId: z.string().trim().optional(),
  price: z.number().min(0, "Price is required"),
  categoryId: z.string().trim().optional().nullable(),
  description: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  barcode: z.string().trim().optional(),
  costPrice: z.number().min(0).optional(),
  taxRate: z.number().min(0).optional(),
  gstRate: z.number().min(0).optional(),
  hsnCode: z.string().trim().optional(),
  packagingUnits: z.array(packagingUnitSchema).optional(),
  onHandQty: z.number().min(0).optional(),
  lowStockThreshold: z.number().min(0).optional(),
  isFeatured: z.boolean().optional(),
  image: z.string().trim().optional(),
  tags: z.array(z.string().trim()).optional(),
  sortOrder: z.number().int().optional()
}).passthrough();

export const productUpdateSchema = productCreateSchema.partial().passthrough();

export const orderItemSchema = z.object({
  productId: z.string().trim().optional(),
  name: z.string().trim().min(1, "Item name is required"),
  qty: z.number().positive("Quantity is required"),
  soldQty: z.number().positive().optional(),
  soldUnit: z.string().trim().optional(),
  baseQty: z.number().positive().optional(),
  conversionFactor: z.number().positive().optional(),
  packagingUnitId: z.string().trim().optional(),
  price: z.number().min(0, "Price is required"),
  taxRate: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  unit: z.string().trim().optional(),
  hsnCode: z.string().trim().optional(),
  notes: z.string().trim().optional()
});

export const orderCreateSchema = z.object({
  outletId: z.string().trim().min(1, "Outlet is required"),
  billingMode: z.enum(["takeaway", "dine_in", "parcel", "quick", "wholesale"]).optional(),
  taxMode: z.enum(["exclusive", "inclusive"]).optional(),
  taxableAmount: z.number().min(0).optional(),
  cgst: z.number().min(0).optional(),
  sgst: z.number().min(0).optional(),
  igst: z.number().min(0).optional(),
  supplyType: z.enum(["intra", "inter"]).optional(),
  items: z.array(orderItemSchema).min(1, "At least one item is required"),
  discount: z.number().min(0).optional(),
  notes: z.string().trim().optional(),
  customerName: z.string().trim().optional(),
  customerPhone: z.string().trim().optional(),
  customerId: z.string().trim().optional(),
  amountPaid: z.number().min(0).optional(),
  amountDue: z.number().min(0).optional(),
  generateGstInvoice: z.boolean().optional(),
  payment: z.object({
    method: z.enum(["cash", "upi", "card", "wallet", "split", "credit"]).optional(),
    amount: z.number().min(0).optional(),
    split: z.record(z.number().min(0)).optional()
  }).optional()
}).passthrough();

export const customerCreateSchema = z.object({
  outletId: z.string().trim().optional(),
  name: z.string().trim().min(2, "Customer name is required"),
  phone: z.string().trim().optional(),
  gstin: z.string().trim().optional(),
  address: z.string().trim().optional(),
  defaultTaxMode: z.enum(["exclusive", "inclusive"]).optional(),
  creditLimit: z.number().min(0).optional(),
  openingBalance: z.number().min(0).optional(),
  note: z.string().trim().optional()
}).passthrough();

export const customerUpdateSchema = customerCreateSchema.partial().extend({
  isActive: z.boolean().optional()
}).passthrough();

export const customerPaymentSchema = z.object({
  amount: z.number().positive("Payment amount is required"),
  method: z.enum(["cash", "upi", "card", "wallet"]).optional(),
  note: z.string().trim().optional(),
  outletId: z.string().trim().optional()
}).passthrough();

export const refundOrderSchema = z.object({
  reason: z.string().trim().min(2, "Refund reason is required")
}).passthrough();

export const voidRecordSchema = z.object({
  reason: z.string().trim().min(2, "Void reason is required")
}).passthrough();

export const stockAdjustSchema = z.object({
  productId: z.string().trim().min(1, "Product is required"),
  outletId: z.string().trim().min(1, "Outlet is required"),
  qty: z.number(),
  type: z.enum(["adjustment", "opening", "sale", "return", "transfer_in", "transfer_out", "purchase", "wastage"]).optional(),
  note: z.string().trim().optional(),
  soldQty: z.number().optional(),
  soldUnit: z.string().trim().optional(),
  packagingUnitId: z.string().trim().optional(),
  conversionFactor: z.number().positive().optional(),
  baseUnit: z.string().trim().optional(),
  soldUnitCost: z.number().min(0).optional(),
  soldUnitPrice: z.number().min(0).optional(),
  updateProductPrices: z.boolean().optional(),
  lossReason: z.enum(["spoilage", "expiry", "damage", "customer_return_spoiled", "owner_replacement", "other"]).optional()
}).passthrough();

export const stockTransferSchema = z.object({
  fromOutletId: z.string().trim().min(1, "Source outlet is required"),
  toOutletId: z.string().trim().min(1, "Destination outlet is required"),
  items: z.array(z.object({
    productId: z.string().trim().min(1, "Product is required"),
    productName: z.string().trim().optional(),
    qty: z.number().positive("Quantity is required"),
    unit: z.string().trim().optional()
  })).min(1, "At least one item is required"),
  note: z.string().trim().optional()
}).passthrough();

export const expenseCreateSchema = z.object({
  outletId: z.string().trim().min(1, "Outlet is required"),
  category: z.string().trim().min(2, "Category is required"),
  amount: z.number().positive("Amount is required"),
  note: z.string().trim().optional(),
  date: z.string().optional()
}).passthrough();

// Plan schemas (admin)
export const planCreateSchema = z.object({
  name: z.string().trim().min(2, "Plan name is required"),
  description: z.string().trim().optional(),
  monthlyPrice: z.number().min(0),
  yearlyPrice: z.number().min(0),
  maxOutlets: z.number().int().min(1).default(1),
  maxStaff: z.number().int().min(1).default(5),
  maxProducts: z.number().int().min(1).default(50),
  features: z.array(z.string().trim()).optional(),
  planType: z.enum(["retail", "wholesale", "hybrid"]).optional(),
  featureKeys: z.array(z.string().trim()).optional(),
  isActive: z.boolean().optional(),
  isPopular: z.boolean().optional(),
  sortOrder: z.number().int().optional()
}).passthrough();

export const planUpdateSchema = planCreateSchema.partial().passthrough();
