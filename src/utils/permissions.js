import { Role } from "../models/Role.js";

// Returns null to indicate 'full' (superadmin or owner-without-roleId)
export async function getRequesterPermissions(req) {
  if (req.user?.role === "superadmin") return null;
  if (req.user?.role === "owner" && !req.user?.roleId) return null;
  const roleId = req.user?.roleId;
  if (!roleId) return [];
  const role = await Role.findById(roleId).lean();
  return role?.permissions || [];
}

function normalizePerms(perms) {
  // convert to map: module -> Set(actions)
  const map = new Map();
  for (const p of perms || []) {
    map.set(p.module, new Set(p.actions || []));
  }
  return map;
}

export async function canAssignPermissions(req, requestedPermissions) {
  const requesterPerms = await getRequesterPermissions(req);
  if (requesterPerms === null) return true; // full access
  const rMap = normalizePerms(requesterPerms);
  for (const rp of requestedPermissions || []) {
    const mod = rp.module;
    const actions = rp.actions || [];
    const allowed = rMap.get(mod);
    if (!allowed) return false;
    for (const a of actions) {
      if (!allowed.has(a)) return false;
    }
  }
  return true;
}
