import { Router } from "express";
import { register, login, loginWithEmail, getMe, forgotPassword, resetPassword, checkEmail, setupPassword } from "../controllers/authController.js";
import { sendLoginOtp, verifyLoginOtp } from "../controllers/authController.js";
import { requireAuth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { loginSchema, emailLoginSchema, otpEmailSchema, otpVerifySchema, registerSchema, forgotPasswordSchema, resetPasswordSchema, setupPasswordSchema } from "../validators/schemas.js";

const authRouter = Router();

authRouter.post("/register", validate(registerSchema), register);
authRouter.post("/check-email", validate(otpEmailSchema), checkEmail);
authRouter.post("/login", validate(emailLoginSchema), loginWithEmail);
authRouter.post("/login-pin", validate(loginSchema), login);
authRouter.post("/send-otp", validate(otpEmailSchema), sendLoginOtp);
authRouter.post("/verify-otp", validate(otpVerifySchema), verifyLoginOtp);
authRouter.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
authRouter.post("/reset-password", validate(resetPasswordSchema), resetPassword);
authRouter.post("/setup-password", requireAuth, validate(setupPasswordSchema), setupPassword);
authRouter.get("/me", requireAuth, getMe);

export { authRouter };
