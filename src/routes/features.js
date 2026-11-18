import { Router } from "express";
import { listFeatures } from "../controllers/featureController.js";
import { requireAuth } from "../middlewares/auth.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";

const featureRouter = Router();

featureRouter.get("/", requireAuth, rateLimit("publicRead"), listFeatures);

export { featureRouter };
