import { Router } from "express";
import { z } from "zod";
import { createOutlet, listOutlets } from "../controllers/outletController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/roles.js";
import { validate } from "../middlewares/validate.js";

export const outletRouter = Router();

const outletSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  code: z.string().optional()
});

outletRouter.get(
  "/",
  requireAuth,
  requireRole(["owner", "manager"]),
  listOutlets
);
outletRouter.post(
  "/",
  requireAuth,
  requireRole(["owner", "manager"]),
  validate(outletSchema),
  createOutlet
);
