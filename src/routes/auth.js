import { Router } from "express";
import { register, login, getMe } from "../controllers/authController.js";
import { sendLoginOtp, verifyLoginOtp } from "../controllers/authController.js";
import { requireAuth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { loginSchema, otpEmailSchema, otpVerifySchema, registerSchema } from "../validators/schemas.js";
const authRouter = Router();
authRouter.post("/register", validate(registerSchema), register);
authRouter.post("/login", validate(loginSchema), login);
authRouter.post("/send-otp", validate(otpEmailSchema), sendLoginOtp);
authRouter.post("/verify-otp", validate(otpVerifySchema), verifyLoginOtp);
authRouter.get("/me", requireAuth, getMe);
export {
  authRouter
};
