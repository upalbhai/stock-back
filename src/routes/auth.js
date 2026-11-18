import { Router } from "express";
import { register, loginWithEmail, getMe, forgotPassword, resetPassword, checkEmail, setupPassword } from "../controllers/authController.js";
import { sendLoginOtp, verifyLoginOtp } from "../controllers/authController.js";
import { listSessions, revokeSession, revokeAllSessions } from "../controllers/sessionController.js";
import { requireAuth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";
import { emailLoginSchema, otpEmailSchema, otpVerifySchema, registerSchema, forgotPasswordSchema, resetPasswordSchema, setupPasswordSchema } from "../validators/schemas.js";

const authRouter = Router();

authRouter.post("/register", rateLimit("register"), validate(registerSchema), register);
authRouter.post("/check-email", rateLimit("checkEmail"), validate(otpEmailSchema), checkEmail);
authRouter.post("/login", rateLimit("login"), validate(emailLoginSchema), loginWithEmail);
authRouter.post("/send-otp", rateLimit("sendOtp"), validate(otpEmailSchema), sendLoginOtp);
authRouter.post("/verify-otp", rateLimit("login"), validate(otpVerifySchema), verifyLoginOtp);
authRouter.post("/forgot-password", rateLimit("forgotPassword"), validate(forgotPasswordSchema), forgotPassword);
authRouter.post("/reset-password", rateLimit("forgotPassword"), validate(resetPasswordSchema), resetPassword);
authRouter.post("/setup-password", requireAuth, rateLimit("sessions"), validate(setupPasswordSchema), setupPassword);
authRouter.get("/me", requireAuth, rateLimit("sessions"), getMe);

// Session management
authRouter.get("/sessions", requireAuth, rateLimit("sessions"), listSessions);
authRouter.delete("/sessions/:id", requireAuth, rateLimit("sessions"), revokeSession);
authRouter.delete("/sessions", requireAuth, rateLimit("sessions"), revokeAllSessions);

export { authRouter };
