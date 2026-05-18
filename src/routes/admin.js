import { Router } from "express";
import {
  adminListBusinesses,
  adminToggleBusiness,
  adminUpdatePlan,
  adminImpersonate,
  adminStopImpersonation,
  adminPlatformStats
} from "../controllers/adminController.js";
import { requireSuperAdmin } from "../middlewares/auth.js";
const adminRouter = Router();
adminRouter.use(requireSuperAdmin);
adminRouter.get("/stats", adminPlatformStats);
adminRouter.get("/businesses", adminListBusinesses);
adminRouter.patch("/businesses/:id/toggle", adminToggleBusiness);
adminRouter.patch("/businesses/:id/plan", adminUpdatePlan);
adminRouter.post("/impersonate", adminImpersonate);
adminRouter.delete("/impersonate", adminStopImpersonation);
export {
  adminRouter
};
