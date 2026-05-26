import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Role, MODULES, ACTIONS } from "../models/Role.js";
import { canAssignPermissions } from "../utils/permissions.js";
import { AuditLog } from "../models/AuditLog.js";
async function listRoles(req, res, next) {
  try {
    const { businessId } = req.user;
    const roles = await Role.find({ businessId }).sort({ isSystem: -1, name: 1 }).lean();
    return successResponse({
      res: res,

      data: {
        roles,
        modules: MODULES,
        actions: ACTIONS
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function getRole(req, res, next) {
  try {
    const { businessId } = req.user;
    const role = await Role.findOne({ _id: req.params.id, businessId }).lean();
    if (!role) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Role not found"
    });
    return successResponse({
      res: res,

      data: {
        role
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function createRole(req, res, next) {
  try {
    const { businessId } = req.user;
    const { name, description, permissions, outletScope, outletIds } = req.body;
    // ensure requester is allowed to assign the requested permissions
    if (permissions && permissions.length) {
      const ok = await canAssignPermissions(req, permissions);
      if (!ok) return errorResponse({
        res: res,
        statusCode: 403,
        message: "Cannot assign permissions you don't have"
      });
    }
    const role = await Role.create({
      businessId,
      name,
      description,
      permissions: permissions || [],
      outletScope: outletScope || "all",
      outletIds: outletIds || [],
      isSystem: false
    });
    await AuditLog.create({
      businessId,
      actorId: req.user?.userId,
      module: "roles",
      action: "create",
      targetType: "Role",
      targetId: role._id,
      targetName: role.name,
      message: `Role created: ${role.name}`,
      ip: req.ip
    });
    return successResponse({
      res: res,
      statusCode: 201,

      data: {
        role
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function updateRole(req, res, next) {
  try {
    const { businessId } = req.user;
    const existing = await Role.findOne({ _id: req.params.id, businessId });
    if (!existing) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Role not found"
    });
    if (existing.isSystem) return errorResponse({
      res: res,
      statusCode: 403,
      message: "Cannot modify system roles"
    });
    const { name, description, permissions, outletScope, outletIds } = req.body;
    if (permissions && permissions.length) {
      const ok = await canAssignPermissions(req, permissions);
      if (!ok) return errorResponse({
        res: res,
        statusCode: 403,
        message: "Cannot assign permissions you don't have"
      });
    }
    const role = await Role.findByIdAndUpdate(
      req.params.id,
      { $set: { name, description, permissions, outletScope, outletIds } },
      { new: true }
    );
    return successResponse({
      res: res,

      data: {
        role
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function deleteRole(req, res, next) {
  try {
    const { businessId } = req.user;
    const role = await Role.findOne({ _id: req.params.id, businessId });
    if (!role) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Role not found"
    });
    if (role.isSystem) return errorResponse({
      res: res,
      statusCode: 403,
      message: "Cannot delete system roles"
    });
    await Role.findByIdAndDelete(req.params.id);
    return successResponse({
      res: res,
      message: "Role deleted"
    });
  } catch (error) {
    return next(error);
  }
}
export {
  createRole,
  deleteRole,
  getRole,
  listRoles,
  updateRole
};
