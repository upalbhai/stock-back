import { Router } from "express";
import {
  adminListBusinesses,
  adminToggleBusiness,
  adminUpdatePlan,
  adminApproveBusiness,
  adminSetBusinessStatus
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
  adminCreateManualSubscription,
  adminCancelSubscription
} from "../controllers/admin/subscriptionController.js";
import { requireAuth, requireSuperAdmin } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";
import { adminImpersonateSchema, adminPlanSchema, adminStatusSchema, idParamSchema } from "../validators/schemas.js";

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
adminRouter.patch("/outlets/:id/approve", rateLimit("admin"), validate(idParamSchema, "params"), adminApproveOutlet);
adminRouter.patch("/outlets/:id/status", rateLimit("admin"), validate(adminStatusSchema), adminSetOutletStatus);
adminRouter.post("/impersonate", rateLimit("admin"), validate(adminImpersonateSchema), adminImpersonate);

// Manual subscription routes
adminRouter.post("/subscriptions/manual", rateLimit("admin"), adminCreateManualSubscription);
adminRouter.post("/subscriptions/cancel", rateLimit("admin"), adminCancelSubscription);

export { adminRouter };
