import { Router } from "express";
import {
  adminListBusinesses,
  adminToggleBusiness,
  adminUpdatePlan,
  adminApproveBusiness,
  adminSetBusinessStatus,
  getPendingPlanRequests,
  approvePlanRequest,
  rejectPlanRequest,
  getAdminPlanRequestHistory
} from "../controllers/admin/businessController.js";
import {
  adminApproveOutlet,
  adminSetOutletStatus,
  adminListOutlets
} from "../controllers/admin/outletController.js";
import {
  adminImpersonate,
  adminStopImpersonation
} from "../controllers/admin/impersonationController.js";
import {
  adminPlatformStats
} from "../controllers/admin/statsController.js";
import {
  adminListSubscriptions,
  adminCreateManualSubscription,
  adminCancelSubscription,
  adminPreviewSubscriptionEmail,
  adminSendSubscriptionEmail
} from "../controllers/admin/subscriptionController.js";
import {
  createSystemAdmin
} from "../controllers/admin/adminUserController.js";
import {
  getSettings,
  updateSettings
} from "../controllers/admin/settingsController.js";
import {
  getAgents,
  approveAgent,
  createAgent,
  getPayoutRequests,
  processPayoutRequest,
  getAgentPerformanceStats
} from "../controllers/admin/adminAgentController.js";
import {
  verifyManualPayment,
  getManualPayments,
  resendManualPaymentInvoice,
  rejectManualPayment,
  getManualPaymentProof
} from "../controllers/manualPaymentController.js";
import { requireAuth, requireSuperAdmin } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";
import { adminImpersonateSchema, adminPlanSchema, adminStatusSchema, idParamSchema, blogCreateSchema, blogUpdateSchema } from "../validators/schemas.js";
import { requireBlogPermission } from "../middlewares/blogPermission.js";
import {
  getAdminBlogs,
  getAdminBlogById,
  createBlog,
  updateBlog,
  publishBlog,
  unpublishBlog,
  deleteBlog,
  uploadBlogImage
} from "../controllers/admin/blogController.js";
import { blogImageUpload } from "../middlewares/upload.js";

const adminRouter = Router();

// Allow either superadmins or active impersonators to end impersonation
adminRouter.delete(
  "/impersonate",
  requireAuth,
  (req, res, next) => {
    if (req.user?.role !== "superadmin" && !req.user?.impersonating) {
      return res.status(403).json({ message: "Super admin access or impersonation session required" });
    }
    next();
  },
  rateLimit("admin"),
  adminStopImpersonation
);

adminRouter.use(requireSuperAdmin);
adminRouter.get("/stats", rateLimit("admin"), adminPlatformStats);
adminRouter.get("/businesses", rateLimit("admin"), adminListBusinesses);
adminRouter.get("/outlets", rateLimit("admin"), adminListOutlets);
adminRouter.patch("/businesses/:id/toggle", rateLimit("admin"), validate(idParamSchema, "params"), adminToggleBusiness);

adminRouter.patch("/businesses/:id/approve", rateLimit("admin"), validate(idParamSchema, "params"), adminApproveBusiness);
adminRouter.patch("/businesses/:id/status", rateLimit("admin"), validate(adminStatusSchema), adminSetBusinessStatus);
adminRouter.patch("/businesses/:id/plan", rateLimit("admin"), validate(adminPlanSchema), adminUpdatePlan);

// Plan Change Requests
adminRouter.get("/businesses/pending-plans", rateLimit("admin"), getPendingPlanRequests);
adminRouter.post("/businesses/:id/approve-plan", rateLimit("admin"), validate(idParamSchema, "params"), approvePlanRequest);
adminRouter.post("/businesses/:id/reject-plan", rateLimit("admin"), validate(idParamSchema, "params"), rejectPlanRequest);
adminRouter.get("/businesses/:id/plan-history", rateLimit("admin"), validate(idParamSchema, "params"), getAdminPlanRequestHistory);

adminRouter.patch("/outlets/:id/approve", rateLimit("admin"), validate(idParamSchema, "params"), adminApproveOutlet);
adminRouter.patch("/outlets/:id/status", rateLimit("admin"), validate(adminStatusSchema), adminSetOutletStatus);
adminRouter.post("/impersonate", rateLimit("admin"), validate(adminImpersonateSchema), adminImpersonate);

// Manual subscription routes
adminRouter.get("/subscriptions", rateLimit("admin"), adminListSubscriptions);
adminRouter.post("/subscriptions/manual", rateLimit("admin"), adminCreateManualSubscription);
adminRouter.post("/subscriptions/cancel", rateLimit("admin"), adminCancelSubscription);
adminRouter.get("/businesses/:id/preview-email", rateLimit("admin"), validate(idParamSchema, "params"), adminPreviewSubscriptionEmail);
adminRouter.post("/businesses/:id/send-email", rateLimit("admin"), validate(idParamSchema, "params"), adminSendSubscriptionEmail);

adminRouter.get("/payments/manual", rateLimit("admin"), getManualPayments);
adminRouter.get("/payments/manual/:paymentId/proof", rateLimit("admin"), getManualPaymentProof);
adminRouter.put("/payments/manual/:paymentId/verify", rateLimit("admin"), verifyManualPayment);
adminRouter.put("/payments/manual/:paymentId/reject", rateLimit("admin"), rejectManualPayment);
adminRouter.post("/payments/manual/:paymentId/resend-invoice", rateLimit("admin"), resendManualPaymentInvoice);

// System Admin User Management
adminRouter.post("/system-users", rateLimit("admin"), createSystemAdmin);

// Global Platform Settings
adminRouter.get("/settings", rateLimit("admin"), getSettings);
adminRouter.put("/settings", rateLimit("admin"), updateSettings);

// Agents Management
adminRouter.get("/agents", rateLimit("admin"), getAgents);
adminRouter.get("/agents/performance", rateLimit("admin"), getAgentPerformanceStats);
adminRouter.post("/agents", rateLimit("admin"), createAgent);
adminRouter.put("/agents/:agentId/approve", rateLimit("admin"), approveAgent);

// Agent Payout Requests
adminRouter.get("/payout-requests", rateLimit("admin"), getPayoutRequests);
adminRouter.post("/payout-requests/:id/process", rateLimit("admin"), processPayoutRequest);

// Blogs
adminRouter.get("/blogs", rateLimit("admin"), requireBlogPermission("read"), getAdminBlogs);
adminRouter.post("/blogs", rateLimit("admin"), requireBlogPermission("create"), validate(blogCreateSchema), createBlog);
// IMPORTANT: /blogs/upload must be before /blogs/:id to avoid route collision
adminRouter.post("/blogs/upload", rateLimit("admin"), requireBlogPermission("update"), blogImageUpload.single("image"), uploadBlogImage);
// Gap #6: Single-post endpoint — registered before /:id sub-routes
adminRouter.get("/blogs/:id", rateLimit("admin"), requireBlogPermission("read"), validate(idParamSchema, "params"), getAdminBlogById);
adminRouter.patch("/blogs/:id", rateLimit("admin"), requireBlogPermission("update"), validate(idParamSchema, "params"), validate(blogUpdateSchema), updateBlog);
adminRouter.post("/blogs/:id/publish", rateLimit("admin"), requireBlogPermission("publish"), validate(idParamSchema, "params"), publishBlog);
adminRouter.post("/blogs/:id/unpublish", rateLimit("admin"), requireBlogPermission("publish"), validate(idParamSchema, "params"), unpublishBlog);
adminRouter.delete("/blogs/:id", rateLimit("admin"), requireBlogPermission("delete"), validate(idParamSchema, "params"), deleteBlog);

export { adminRouter };
