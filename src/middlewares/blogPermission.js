export function requireBlogPermission(action) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Reject non-platform users (shop owners, staff, etc.)
      if (req.user?.businessId && req.user?.role !== "superadmin") {
        return res.status(403).json({ message: "Access denied: Platform only feature" });
      }

      const { User } = await import("../models/User.js");
      const user = await User.findById(userId).lean();

      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Full access if role is superadmin and customPermissions are empty/absent
      if (user.role === "superadmin" && (!user.customPermissions || user.customPermissions.length === 0)) {
        return next();
      }

      // Otherwise check customPermissions for module: "blogs"
      let hasPermission = false;
      if (user.customPermissions && user.customPermissions.length > 0) {
        const blogPerm = user.customPermissions.find((p) => p.module === "blogs");
        if (blogPerm && blogPerm.actions.includes(action)) {
          hasPermission = true;
        }
      }

      if (!hasPermission) {
        return res.status(403).json({ message: `Blog permission denied: requires blogs:${action}` });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
