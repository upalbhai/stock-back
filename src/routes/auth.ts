import { Router } from "express";
import { z } from "zod";
import { login, register } from "../controllers/authController.js";
import { validate } from "../middlewares/validate.js";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(6),
  pin: z.string().min(4),
  role: z.enum(["owner", "manager", "staff"]).optional(),
  outletId: z.string().optional(),
  outletName: z.string().optional()
});

const loginSchema = z.object({
  phone: z.string().min(6),
  pin: z.string().min(4)
});

authRouter.post("/register", validate(registerSchema), register);
authRouter.post("/login", validate(loginSchema), login);
