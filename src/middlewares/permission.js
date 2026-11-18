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
      
      const { User } = await import("../models/User.js");
      const user = await User.findById(userId).populate("roleId").lean();
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      let hasPermission = false;
      let outletScope = "all";
      let roleOutletIds = [];

      // Check role permissions first
      if (user.roleId) {
        const role = user.roleId;
        outletScope = role.outletScope || "all";
        roleOutletIds = role.outletIds || [];
        const rolePerm = role.permissions?.find((p) => p.module === module);
        if (rolePerm && rolePerm.actions.includes(action)) {
          hasPermission = true;
        }
      }

      // Check custom user permissions
      if (!hasPermission && user.customPermissions) {
        const customPerm = user.customPermissions.find((p) => p.module === module);
        if (customPerm && customPerm.actions.includes(action)) {
          hasPermission = true;
        }
      }

      // If neither role nor user custom permissions grant access
      if (!hasPermission) {
        return res.status(403).json({ message: `Permission denied: ${module}:${action}` });
      }

      if (outletScope === "restricted" && roleOutletIds?.length) {
        const requestedOutletId = req.query.outletId || req.body?.outletId || req.params?.outletId;
        if (requestedOutletId) {
          const allowed = roleOutletIds.map((id) => id.toString()).includes(requestedOutletId);
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
async function requireBusinessOwner(req, res, next) {
  try {
    if (req.user?.role === "superadmin") {
      return next();
    }
    if (req.user?.role !== "owner") {
      return res.status(403).json({ message: "Access denied: Owner role required" });
    }
    const targetBusinessId = req.params.businessId || req.params.id || req.body.businessId || req.query.businessId || req.user?.businessId;
    if (!targetBusinessId) {
      return res.status(400).json({ message: "Business ID is required" });
    }
    const { Business } = await import("../models/Business.js");
    const business = await Business.findById(targetBusinessId).lean();
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }
    if (business.ownerId.toString() !== req.user?.userId.toString()) {
      return res.status(403).json({ message: "Access denied: You do not own this business" });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}
export {
  requireBusiness,
  requirePermission,
  requireBusinessOwner
};
