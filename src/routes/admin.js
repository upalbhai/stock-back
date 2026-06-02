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
  adminStopImpersonation
);

adminRouter.use(requireSuperAdmin);
adminRouter.get("/stats", adminPlatformStats);
adminRouter.get("/businesses", adminListBusinesses);
adminRouter.get("/outlets", adminListOutlets);
adminRouter.patch("/businesses/:id/toggle", validate(idParamSchema, "params"), adminToggleBusiness);

adminRouter.patch("/businesses/:id/approve", validate(idParamSchema, "params"), adminApproveBusiness);
adminRouter.patch("/businesses/:id/status", validate(adminStatusSchema), adminSetBusinessStatus);
adminRouter.patch("/businesses/:id/plan", validate(adminPlanSchema), adminUpdatePlan);
adminRouter.patch("/outlets/:id/approve", validate(idParamSchema, "params"), adminApproveOutlet);
adminRouter.patch("/outlets/:id/status", validate(adminStatusSchema), adminSetOutletStatus);
adminRouter.post("/impersonate", validate(adminImpersonateSchema), adminImpersonate);

// Manual subscription routes
adminRouter.post("/subscriptions/manual", adminCreateManualSubscription);
adminRouter.post("/subscriptions/cancel", adminCancelSubscription);

export {
  adminRouter
};
