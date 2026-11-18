import { successResponse } from "../../utils/successResponse.js";
import { errorResponse } from "../../utils/errorResponse.js";
import { Role, ADMIN_MODULES } from "../../models/Role.js";
import { User } from "../../models/User.js";
import { AuditLog } from "../../models/AuditLog.js";

const DEFAULT_PLATFORM_ROLES = [
  {
    name: "Super Administrator",
    description: "Unrestricted platform-wide access across all administrative scopes and systems.",
    isSystem: true,
    permissions: ADMIN_MODULES.map((mod) => ({
      module: mod,
      actions: mod === "blogs"
        ? ["create", "read", "update", "delete", "publish", "unpublish"]
        : ["create", "read", "update", "delete", "approve"]
    }))
  },
  {
    name: "Operations & Support Lead",
    description: "Tenant onboarding, outlet management, user registry, and customer store impersonation.",
    isSystem: true,
    permissions: [
      { module: "dashboard", actions: ["read"] },
      { module: "businesses", actions: ["create", "read", "update", "approve"] },
      { module: "outlets", actions: ["read", "update", "approve"] },
      { module: "users", actions: ["create", "read", "update"] },
      { module: "audit_logs", actions: ["read"] }
    ]
  },
  {
    name: "Billing & Subscriptions Manager",
    description: "Subscription lifecycles, custom plan change requests, and manual payment verification.",
    isSystem: true,
    permissions: [
      { module: "dashboard", actions: ["read"] },
      { module: "subscriptions", actions: ["create", "read", "update", "delete"] },
      { module: "plans", actions: ["create", "read", "update"] },
      { module: "payments", actions: ["read", "update", "approve"] }
    ]
  },
  {
    name: "Content & Marketing Editor",
    description: "MiniHisab blog CMS authoring, article publishing, media uploads, and SEO metadata.",
    isSystem: true,
    permissions: [
      { module: "blogs", actions: ["create", "read", "update", "delete", "publish", "unpublish"] }
    ]
  },
  {
    name: "Partner & Agent Manager",
    description: "Sales agent onboarding, commission rates, performance analytics, and payout processing.",
    isSystem: true,
    permissions: [
      { module: "dashboard", actions: ["read"] },
      { module: "agents", actions: ["create", "read", "update", "approve"] }
    ]
  }
];

export async function ensureDefaultPlatformRoles() {
  for (const preset of DEFAULT_PLATFORM_ROLES) {
    const existing = await Role.findOne({ roleType: "platform", name: preset.name });
    if (!existing) {
      await Role.create({
        ...preset,
        roleType: "platform",
        businessId: null
      });
    }
  }
}

export async function listAdminRoles(req, res, next) {
  try {
    await ensureDefaultPlatformRoles();

    const roles = await Role.find({ roleType: "platform" })
      .sort({ isSystem: -1, createdAt: 1 })
      .lean();

    const userCounts = await User.aggregate([
      { $match: { role: "superadmin", roleId: { $ne: null } } },
      { $group: { _id: "$roleId", count: { $sum: 1 } } }
    ]);

    const countMap = new Map();
    for (const item of userCounts) {
      countMap.set(String(item._id), item.count);
    }

    const enrichedRoles = roles.map((role) => ({
      ...role,
      userCount: countMap.get(String(role._id)) || 0
    }));

    return successResponse({
      res,
      data: {
        roles: enrichedRoles,
        availableModules: ADMIN_MODULES,
        availableActions: ["create", "read", "update", "delete", "publish", "approve"]
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function createAdminRole(req, res, next) {
  try {
    const { name, description, permissions } = req.body;

    if (!name || !name.trim()) {
      return errorResponse({ res, statusCode: 400, message: "Role name is required" });
    }

    const existing = await Role.findOne({
      roleType: "platform",
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") }
    });

    if (existing) {
      return errorResponse({ res, statusCode: 409, message: "A platform role with this name already exists" });
    }

    const role = await Role.create({
      name: name.trim(),
      description: description?.trim() || "",
      permissions: permissions || [],
      roleType: "platform",
      businessId: null,
      isSystem: false
    });

    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "create_admin_role",
      targetType: "Role",
      targetId: role._id,
      targetName: role.name,
      message: `Created custom admin role: ${role.name}`,
      ip: req.ip
    });

    return successResponse({
      res,
      statusCode: 201,
      message: "Admin role created successfully",
      data: { role }
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateAdminRole(req, res, next) {
  try {
    const { id } = req.params;
    const { name, description, permissions } = req.body;

    const role = await Role.findOne({ _id: id, roleType: "platform" });
    if (!role) {
      return errorResponse({ res, statusCode: 404, message: "Admin role not found" });
    }

    if (name && name.trim() !== role.name) {
      if (role.isSystem) {
        return errorResponse({ res, statusCode: 400, message: "System preset roles cannot be renamed" });
      }
      const existing = await Role.findOne({
        _id: { $ne: id },
        roleType: "platform",
        name: { $regex: new RegExp(`^${name.trim()}$`, "i") }
      });
      if (existing) {
        return errorResponse({ res, statusCode: 409, message: "Another platform role already has this name" });
      }
      role.name = name.trim();
    }

    if (description !== undefined) {
      role.description = description.trim();
    }

    if (permissions && Array.isArray(permissions)) {
      role.permissions = permissions;
    }

    await role.save();

    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "update_admin_role",
      targetType: "Role",
      targetId: role._id,
      targetName: role.name,
      message: `Updated admin role: ${role.name}`,
      ip: req.ip
    });

    return successResponse({
      res,
      message: "Admin role updated successfully",
      data: { role }
    });
  } catch (error) {
    return next(error);
  }
}

export async function deleteAdminRole(req, res, next) {
  try {
    const { id } = req.params;

    const role = await Role.findOne({ _id: id, roleType: "platform" });
    if (!role) {
      return errorResponse({ res, statusCode: 404, message: "Admin role not found" });
    }

    if (role.isSystem) {
      return errorResponse({ res, statusCode: 400, message: "System default roles cannot be deleted" });
    }

    const assignedUsersCount = await User.countDocuments({ roleId: role._id });
    if (assignedUsersCount > 0) {
      return errorResponse({
        res,
        statusCode: 400,
        message: `Cannot delete this role because ${assignedUsersCount} admin user(s) are currently assigned to it. Reassign them first.`
      });
    }

    await Role.findByIdAndDelete(id);

    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "delete_admin_role",
      targetType: "Role",
      targetId: role._id,
      targetName: role.name,
      message: `Deleted custom admin role: ${role.name}`,
      ip: req.ip
    });

    return successResponse({
      res,
      message: "Admin role deleted successfully"
    });
  } catch (error) {
    return next(error);
  }
}
