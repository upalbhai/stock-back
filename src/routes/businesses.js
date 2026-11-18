import { Router } from "express";
import { getMyBusiness, updateMyBusiness, requestCustomPlanDirect } from "../controllers/businessController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireBusinessOwner } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";
import { businessUpdateSchema } from "../validators/schemas.js";

const businessRouter = Router();

businessRouter.get("/mine", requireAuth, requireBusinessOwner, rateLimit("businessCrud"), getMyBusiness);
businessRouter.patch("/mine", requireAuth, requireBusinessOwner, rateLimit("businessCrud"), validate(businessUpdateSchema), updateMyBusiness);
businessRouter.post("/mine/request-plan", requireAuth, requireBusinessOwner, rateLimit("businessCrud"), requestCustomPlanDirect);

export { businessRouter };
