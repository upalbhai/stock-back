import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { Invite } from "../models/Invite.js";
import { Role } from "../models/Role.js";
import { AuditLog } from "../models/AuditLog.js";
import { canAssignPermissions } from "../utils/permissions.js";
import mailer from "../utils/mailer.js";

async function listUsers(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, role, isActive } = req.query;
    const query = { businessId };
    if (outletId) query.outletIds = outletId;
    if (role) query.role = role;
    if (isActive !== void 0) query.isActive = isActive === "true";

    const users = await User.find(query)
      .select("-pinHash -inviteToken")
      .populate("roleId", "name permissions")
      .sort({ name: 1 })
      .lean();

    return res.json({ users });
  } catch (error) {
    return next(error);
  }
}

async function getUser(req, res, next) {
  try {
    const { businessId } = req.user;
    const user = await User.findOne({ _id: req.params.id, businessId })
      .select("-pinHash -inviteToken")
      .populate("roleId", "name permissions outletScope outletIds")
      .lean();

    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
}

async function createUser(req, res, next) {
  try {
    const { businessId } = req.user;
    const { name, phone, email, pin, role, roleId, outletIds } = req.body;

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) return res.status(409).json({ message: "Phone number already exists" });

    if (email) {
      const existingEmail = await User.findOne({ email: email.toLowerCase() });
      if (existingEmail) return res.status(409).json({ message: "Email already exists" });
    }

    if (roleId) {
      const targetRole = await Role.findOne({ _id: roleId, businessId }).lean();
      if (!targetRole) return res.status(404).json({ message: "Role not found" });
      const ok = await canAssignPermissions(req, targetRole.permissions);
      if (!ok) {
        return res.status(403).json({ message: "Cannot assign role with permissions you don't have" });
      }
    }

    const pinHash = await bcrypt.hash(pin, 10);
    const user = await User.create({
      businessId,
      name,
      phone,
      email,
      role: role || "staff",
      roleId: roleId || null,
      outletIds: outletIds || [],
      pinHash,
      emailVerified: !!email
    });

    await AuditLog.create({
      businessId,
      actorId: req.user?.userId,
      module: "users",
      action: "create",
      targetType: "User",
      targetId: user._id,
      targetName: user.name,
      message: `Staff added: ${user.name}`,
      ip: req.ip
    });

    const clean = { ...user.toObject(), pinHash: void 0 };
    return res.status(201).json({ user: clean });
  } catch (error) {
    return next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    const { businessId } = req.user;
    const allowed = ["name", "email", "role", "roleId", "outletIds", "isActive", "emailVerified"];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== void 0) update[key] = req.body[key];
    }

    if (req.body.pin) {
      update.pinHash = await bcrypt.hash(req.body.pin, 10);
    }

    if (update.roleId) {
      const targetRole = await Role.findOne({ _id: update.roleId, businessId }).lean();
      if (!targetRole) return res.status(404).json({ message: "Role not found" });
      const ok = await canAssignPermissions(req, targetRole.permissions);
      if (!ok) {
        return res.status(403).json({ message: "Cannot assign role with permissions you don't have" });
      }
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, businessId },
      { $set: update },
      { new: true }
    ).select("-pinHash -inviteToken");

    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
}

async function deleteUser(req, res, next) {
  try {
    const { businessId } = req.user;
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, businessId },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ message: "User deactivated" });
  } catch (error) {
    return next(error);
  }
}

async function createInvite(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletIds, roleId, role, name, phone, email } = req.body;

    if (roleId) {
      const targetRole = await Role.findOne({ _id: roleId, businessId }).lean();
      if (!targetRole) return res.status(404).json({ message: "Role not found" });
      const ok = await canAssignPermissions(req, targetRole.permissions);
      if (!ok) {
        return res.status(403).json({ message: "Cannot invite with a role you can't assign" });
      }
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invite = await Invite.create({
      businessId,
      outletIds: outletIds || [],
      roleId,
      role: role || "staff",
      name,
      phone,
      email: email?.toLowerCase(),
      token,
      expiresAt,
      createdBy: req.user?.userId
    });

    const inviteLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/invite/${token}`;

    if (email) {
      try {
        await mailer.sendInviteEmail(email, inviteLink, name);
      } catch (e) {
        console.warn("Failed to send invite email", e.message);
      }
    }

    return res.status(201).json({ invite, inviteLink });
  } catch (error) {
    return next(error);
  }
}

async function getInvite(req, res, next) {
  try {
    const invite = await Invite.findOne({ token: req.params.token, usedAt: null })
      .populate("businessId", "name logo")
      .populate("roleId", "name")
      .lean();

    if (!invite) return res.status(404).json({ message: "Invite not found or already used" });
    if (new Date() > invite.expiresAt) return res.status(410).json({ message: "Invite expired" });

    return res.json({ invite, businessName: invite.businessId?.name });
  } catch (error) {
    return next(error);
  }
}

async function acceptInvite(req, res, next) {
  try {
    const invite = await Invite.findOne({ token: req.params.token, usedAt: null });
    if (!invite) return res.status(404).json({ message: "Invite not found or already used" });
    if (new Date() > invite.expiresAt) return res.status(410).json({ message: "Invite expired" });

    const { name, pin } = req.body;
    const existingPhone = invite.phone ? await User.findOne({ phone: invite.phone }) : null;
    if (existingPhone) return res.status(409).json({ message: "Phone number already registered on the platform" });
    const existingEmail = invite.email ? await User.findOne({ email: invite.email }) : null;
    if (existingEmail) return res.status(409).json({ message: "Email already registered on the platform" });

    const pinHash = await bcrypt.hash(pin, 10);
    const user = await User.create({
      businessId: invite.businessId,
      name,
      phone: invite.phone,
      email: invite.email,
      role: invite.role,
      roleId: invite.roleId || null,
      outletIds: invite.outletIds || [],
      pinHash,
      emailVerified: !!invite.email
    });

    invite.usedAt = new Date();
    invite.usedBy = user._id;
    await invite.save();

    await AuditLog.create({
      businessId: invite.businessId,
      actorId: user._id,
      actorName: user.name,
      actorRole: user.role,
      module: "auth",
      action: "register",
      message: `Staff accepted invite: ${user.name} (${invite.role})`,
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    });

    const jwtToken = jwt.sign(
      {
        userId: user._id.toString(),
        role: user.role,
        businessId: invite.businessId.toString(),
        outletId: invite.outletIds?.[0]?.toString() || "",
        outletIds: invite.outletIds?.map((id) => id.toString()) || []
      },
      env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      token: jwtToken,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        businessId: invite.businessId,
        outletId: invite.outletIds?.[0] || null,
        outletIds: invite.outletIds || []
      }
    });
  } catch (error) {
    return next(error);
  }
}

export {
  acceptInvite,
  createInvite,
  createUser,
  deleteUser,
  getInvite,
  getUser,
  listUsers,
  updateUser
};
