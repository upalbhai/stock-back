import { Router } from "express";
import { listUsers, getUser, createUser, updateUser, deleteUser, createInvite, getInvite, acceptInvite } from "../controllers/userController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { inviteAcceptSchema, inviteCreateSchema, userCreateSchema, userUpdateSchema } from "../validators/schemas.js";
const userRouter = Router();
userRouter.get("/", requireAuth, requirePermission("users", "read"), listUsers);
userRouter.get("/:id", requireAuth, requirePermission("users", "read"), getUser);
userRouter.post("/", requireAuth, requirePermission("users", "create"), validate(userCreateSchema), createUser);
userRouter.patch("/:id", requireAuth, requirePermission("users", "update"), validate(userUpdateSchema), updateUser);
userRouter.delete("/:id", requireAuth, requirePermission("users", "delete"), deleteUser);
userRouter.post("/invites", requireAuth, requirePermission("users", "create"), validate(inviteCreateSchema), createInvite);
userRouter.get("/invites/:token", getInvite);
userRouter.post("/invites/:token/accept", validate(inviteAcceptSchema), acceptInvite);
export {
  userRouter
};
