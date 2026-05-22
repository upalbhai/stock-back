import { Router } from "express";
import { getMyBusiness, updateMyBusiness } from "../controllers/businessController.js";
import { requireAuth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { businessUpdateSchema } from "../validators/schemas.js";
const businessRouter = Router();
businessRouter.get("/mine", requireAuth, getMyBusiness);
businessRouter.patch("/mine", requireAuth, validate(businessUpdateSchema), updateMyBusiness);
export {
  businessRouter
};
