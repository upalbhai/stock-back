import { Router } from "express";
import { listUsers, getUser, createUser, updateUser, deleteUser, createInvite, getInvite, acceptInvite } from "../controllers/userController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";

export const userRouter = Router();
userRouter.get("/", requireAuth, requirePermission("users", "read"), listUsers);
userRouter.get("/:id", requireAuth, requirePermission("users", "read"), getUser);
userRouter.post("/", requireAuth, requirePermission("users", "create"), createUser);
userRouter.patch("/:id", requireAuth, requirePermission("users", "update"), updateUser);
userRouter.delete("/:id", requireAuth, requirePermission("users", "delete"), deleteUser);
userRouter.post("/invites", requireAuth, requirePermission("users", "create"), createInvite);
userRouter.get("/invites/:token", getInvite); // public - no auth needed
userRouter.post("/invites/:token/accept", acceptInvite); // public - accepts invite
