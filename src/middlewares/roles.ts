import type { NextFunction, Response } from "express";
import type { AuthedRequest } from "./auth.js";

export function requireRole(allowed: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  };
}
