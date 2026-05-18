import { Router } from "express";
import { getMyBusiness, updateMyBusiness } from "../controllers/businessController.js";
import { requireAuth } from "../middlewares/auth.js";

export const businessRouter = Router();
businessRouter.get("/mine", requireAuth, getMyBusiness);
businessRouter.patch("/mine", requireAuth, updateMyBusiness);
