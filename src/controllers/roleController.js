import { Role, MODULES, ACTIONS } from "../models/Role.js";
import { canAssignPermissions } from "../utils/permissions.js";
import { AuditLog } from "../models/AuditLog.js";
async function listRoles(req, res, next) {
  try {
    const { businessId } = req.user;
    const roles = await Role.find({ businessId }).sort({ isSystem: -1, name: 1 }).lean();
    return res.json({ roles, modules: MODULES, actions: ACTIONS });
  } catch (error) {
    return next(error);
  }
}
async function getRole(req, res, next) {
  try {
    const { businessId } = req.user;
    const role = await Role.findOne({ _id: req.params.id, businessId }).lean();
    if (!role) return res.status(404).json({ message: "Role not found" });
    return res.json({ role });
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
      if (!ok) return res.status(403).json({ message: "Cannot assign permissions you don't have" });
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
    return res.status(201).json({ role });
  } catch (error) {
    return next(error);
  }
}
async function updateRole(req, res, next) {
  try {
    const { businessId } = req.user;
    const existing = await Role.findOne({ _id: req.params.id, businessId });
    if (!existing) return res.status(404).json({ message: "Role not found" });
    if (existing.isSystem) return res.status(403).json({ message: "Cannot modify system roles" });
    const { name, description, permissions, outletScope, outletIds } = req.body;
    if (permissions && permissions.length) {
      const ok = await canAssignPermissions(req, permissions);
      if (!ok) return res.status(403).json({ message: "Cannot assign permissions you don't have" });
    }
    const role = await Role.findByIdAndUpdate(
      req.params.id,
      { $set: { name, description, permissions, outletScope, outletIds } },
      { new: true }
    );
    return res.json({ role });
  } catch (error) {
    return next(error);
  }
}
async function deleteRole(req, res, next) {
  try {
    const { businessId } = req.user;
    const role = await Role.findOne({ _id: req.params.id, businessId });
    if (!role) return res.status(404).json({ message: "Role not found" });
    if (role.isSystem) return res.status(403).json({ message: "Cannot delete system roles" });
    await Role.findByIdAndDelete(req.params.id);
    return res.json({ message: "Role deleted" });
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
