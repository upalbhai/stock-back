import { Router } from "express";
import { listUsers, getUser, createUser, updateUser, deleteUser, createInvite, getInvite, acceptInvite, changeUserPassword } from "../controllers/userController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { rateLimit } from "../middlewares/rateLimiter/index.js";
import { inviteAcceptSchema, inviteCreateSchema, userCreateSchema, userUpdateSchema, changePasswordSchema } from "../validators/schemas.js";

const userRouter = Router();

userRouter.get("/", requireAuth, requirePermission("users", "read"), rateLimit("userCrud"), listUsers);
userRouter.get("/:id", requireAuth, requirePermission("users", "read"), rateLimit("userCrud"), getUser);
userRouter.post("/", requireAuth, requirePermission("users", "create"), rateLimit("userCrud"), validate(userCreateSchema), createUser);
userRouter.patch("/:id", requireAuth, requirePermission("users", "update"), rateLimit("userCrud"), validate(userUpdateSchema), updateUser);
userRouter.delete("/:id", requireAuth, requirePermission("users", "delete"), rateLimit("userCrud"), deleteUser);
userRouter.post("/:id/change-password", requireAuth, requirePermission("users", "update"), rateLimit("userCrud"), validate(changePasswordSchema), changeUserPassword);
userRouter.post("/invites", requireAuth, requirePermission("users", "create"), rateLimit("userCrud"), validate(inviteCreateSchema), createInvite);
userRouter.get("/invites/:token", rateLimit("publicRead"), getInvite);
userRouter.post("/invites/:token/accept", rateLimit("register"), validate(inviteAcceptSchema), acceptInvite);

export { userRouter };
