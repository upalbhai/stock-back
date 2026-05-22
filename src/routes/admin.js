import { Router } from "express";
import {
  adminListBusinesses,
  adminToggleBusiness,
  adminUpdatePlan,
  adminImpersonate,
  adminStopImpersonation,
  adminPlatformStats,
  adminApproveBusiness,
  adminSetBusinessStatus,
  adminApproveOutlet,
  adminSetOutletStatus
} from "../controllers/adminController.js";
import { requireSuperAdmin } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { adminImpersonateSchema, adminPlanSchema, adminStatusSchema, idParamSchema } from "../validators/schemas.js";
const adminRouter = Router();
adminRouter.use(requireSuperAdmin);
adminRouter.get("/stats", adminPlatformStats);
adminRouter.get("/businesses", adminListBusinesses);
adminRouter.patch("/businesses/:id/toggle", validate(idParamSchema, "params"), adminToggleBusiness);
adminRouter.patch("/businesses/:id/approve", validate(idParamSchema, "params"), adminApproveBusiness);
adminRouter.patch("/businesses/:id/status", validate(adminStatusSchema), adminSetBusinessStatus);
adminRouter.patch("/businesses/:id/plan", validate(adminPlanSchema), adminUpdatePlan);
adminRouter.patch("/outlets/:id/approve", validate(idParamSchema, "params"), adminApproveOutlet);
adminRouter.patch("/outlets/:id/status", validate(adminStatusSchema), adminSetOutletStatus);
adminRouter.post("/impersonate", validate(adminImpersonateSchema), adminImpersonate);
adminRouter.delete("/impersonate", adminStopImpersonation);
export {
  adminRouter
};
