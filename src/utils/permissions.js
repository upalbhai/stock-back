import { Role } from "../models/Role.js";

// Returns null to indicate 'full' (superadmin or owner-without-roleId)
export async function getRequesterPermissions(req) {
  if (req.user?.role === "superadmin") return null;
  if (req.user?.role === "owner" && !req.user?.roleId) return null;
  
  const userId = req.user?.userId;
  if (!userId) return [];
  
  const { User } = await import("../models/User.js");
  const user = await User.findById(userId).populate("roleId").lean();
  if (!user) return [];

  const rolePerms = user.roleId?.permissions || [];
  const customPerms = user.customPermissions || [];
  
  // Merge them
  const mergedMap = new Map();
  const allPerms = [...rolePerms, ...customPerms];
  
  for (const p of allPerms) {
    if (!mergedMap.has(p.module)) {
      mergedMap.set(p.module, new Set(p.actions));
    } else {
      for (const a of p.actions) {
        mergedMap.get(p.module).add(a);
      }
    }
  }
  
  const result = [];
  for (const [module, actionsSet] of mergedMap.entries()) {
    result.push({ module, actions: Array.from(actionsSet) });
  }
  return result;
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
