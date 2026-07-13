import { Router } from "express";
import { listPlans, listAllPlans, createPlan, updatePlan, deletePlan } from "../controllers/planController.js";
import { requireAuth, requireSuperAdmin } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";
import { planCreateSchema, planUpdateSchema } from "../validators/schemas.js";

const planRouter = Router();

// Publicly accessible list (used on frontend pricing page)
planRouter.get("/", rateLimit("publicRead"), listPlans);

// Admin routes
planRouter.get("/all", requireSuperAdmin, rateLimit("admin"), listAllPlans);
planRouter.post("/", requireSuperAdmin, rateLimit("admin"), validate(planCreateSchema), createPlan);
planRouter.patch("/:id", requireSuperAdmin, rateLimit("admin"), validate(planUpdateSchema), updatePlan);
planRouter.delete("/:id", requireSuperAdmin, rateLimit("admin"), deletePlan);

export { planRouter };
