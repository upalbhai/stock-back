import { Router } from "express";
import { register, login, loginWithEmail, getMe, forgotPassword, resetPassword, checkEmail, setupPassword } from "../controllers/authController.js";
import { sendLoginOtp, verifyLoginOtp } from "../controllers/authController.js";
import { listSessions, revokeSession, revokeAllSessions } from "../controllers/sessionController.js";
import { requireAuth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { emailRateLimiter } from "../middlewares/rateLimiter.js";
import { loginSchema, emailLoginSchema, otpEmailSchema, otpVerifySchema, registerSchema, forgotPasswordSchema, resetPasswordSchema, setupPasswordSchema } from "../validators/schemas.js";

const authRouter = Router();

authRouter.post("/register", emailRateLimiter("register", 5, 30), validate(registerSchema), register);
authRouter.post("/check-email", emailRateLimiter("check", 5, 10), validate(otpEmailSchema), checkEmail);
authRouter.post("/login", validate(emailLoginSchema), loginWithEmail);
authRouter.post("/login-pin", validate(loginSchema), login);
authRouter.post("/send-otp", emailRateLimiter("otp", 3, 10), validate(otpEmailSchema), sendLoginOtp);
authRouter.post("/verify-otp", validate(otpVerifySchema), verifyLoginOtp);
authRouter.post("/forgot-password", emailRateLimiter("forgot", 3, 15), validate(forgotPasswordSchema), forgotPassword);
authRouter.post("/reset-password", validate(resetPasswordSchema), resetPassword);
authRouter.post("/setup-password", requireAuth, validate(setupPasswordSchema), setupPassword);
authRouter.get("/me", requireAuth, getMe);

// Session management
authRouter.get("/sessions", requireAuth, listSessions);
authRouter.delete("/sessions/:id", requireAuth, revokeSession);
authRouter.delete("/sessions", requireAuth, revokeAllSessions);

export { authRouter };
