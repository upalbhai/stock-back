import { Router } from "express";
import { listPlans, listAllPlans, createPlan, updatePlan, deletePlan } from "../controllers/planController.js";
import { requireAuth, requireSuperAdmin } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { planCreateSchema, planUpdateSchema } from "../validators/schemas.js";

const planRouter = Router();

// Publicly accessible list (used on frontend pricing page)
planRouter.get("/", listPlans);

// Admin routes
planRouter.get("/all", requireSuperAdmin, listAllPlans);
planRouter.post("/", requireSuperAdmin, validate(planCreateSchema), createPlan);
planRouter.patch("/:id", requireSuperAdmin, validate(planUpdateSchema), updatePlan);
planRouter.delete("/:id", requireSuperAdmin, deletePlan);

export { planRouter };
