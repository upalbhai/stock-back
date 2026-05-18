import type { NextFunction, Response } from "express";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import type { AuthedRequest } from "./auth.js";
import type { Module, Action } from "../models/Role.js";

/**
 * Dynamic RBAC middleware — checks if the authenticated user's role
 * has the required action on the given module.
 *
 * Also enforces outlet-scope restrictions:
 * If the role has outletScope="restricted", the user can only access
 * outlets listed in their role's outletIds.
 */
export function requirePermission(module: Module, action: Action) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Super admin bypasses all permission checks
      if (req.user?.role === "superadmin") {
        return next();
      }

      // Owner bypasses all permission checks within their business
      if (req.user?.role === "owner") {
        return next();
      }

      const roleId = req.user?.roleId;
      if (!roleId) {
        return res.status(403).json({ message: "No role assigned" });
      }

      const role = await Role.findById(roleId).lean();
      if (!role) {
        return res.status(403).json({ message: "Role not found" });
      }

      // Check module-level permission
      const perm = role.permissions.find((p: { module: string; actions: string[] }) => p.module === module);
      if (!perm || !perm.actions.includes(action)) {
        return res
          .status(403)
          .json({ message: `Permission denied: ${module}:${action}` });
      }

      // Check outlet scope restriction
      if (role.outletScope === "restricted" && role.outletIds?.length) {
        const requestedOutletId =
          (req.query.outletId as string) ||
          (req.body?.outletId as string) ||
          req.params?.outletId;

        if (requestedOutletId) {
          const allowed = role.outletIds
            .map((id: { toString: () => string }) => id.toString())
            .includes(requestedOutletId);
          if (!allowed) {
            return res
              .status(403)
              .json({ message: "Outlet access denied for this role" });
          }
        }
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * Middleware that ensures the user can only access their own business data.
 * Attaches businessId from JWT to req.user for downstream use.
 */
export function requireBusiness(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.businessId && req.user?.role !== "superadmin") {
    return res
      .status(403)
      .json({ message: "No business association found" });
  }
  return next();
}
