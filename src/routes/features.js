import { Router } from "express";
import { listFeatures } from "../controllers/featureController.js";
import { requireAuth } from "../middlewares/auth.js";

const featureRouter = Router();

featureRouter.get("/", requireAuth, listFeatures);

export { featureRouter };
