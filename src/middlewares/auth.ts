import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export type AuthPayload = {
  userId: string;
  role: string;
  businessId?: string;
  outletId?: string;
  outletIds?: string[];
  roleId?: string;
  impersonating?: boolean;
  originalAdminId?: string;
};

export interface AuthedRequest extends Request {
  user?: AuthPayload;
}

export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Missing authorization" });
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Invalid authorization format" });
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireSuperAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  requireAuth(req, res, () => {
    if (req.user?.role !== "superadmin") {
      return res.status(403).json({ message: "Super admin access required" });
    }
    return next();
  });
}
