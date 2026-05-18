import { Role } from "../models/Role.js";
function requirePermission(module, action) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (req.user?.role === "superadmin") {
        return next();
      }
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
      const perm = role.permissions.find((p) => p.module === module);
      if (!perm || !perm.actions.includes(action)) {
        return res.status(403).json({ message: `Permission denied: ${module}:${action}` });
      }
      if (role.outletScope === "restricted" && role.outletIds?.length) {
        const requestedOutletId = req.query.outletId || req.body?.outletId || req.params?.outletId;
        if (requestedOutletId) {
          const allowed = role.outletIds.map((id) => id.toString()).includes(requestedOutletId);
          if (!allowed) {
            return res.status(403).json({ message: "Outlet access denied for this role" });
          }
        }
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
function requireBusiness(req, res, next) {
  if (!req.user?.businessId && req.user?.role !== "superadmin") {
    return res.status(403).json({ message: "No business association found" });
  }
  return next();
}
export {
  requireBusiness,
  requirePermission
};
