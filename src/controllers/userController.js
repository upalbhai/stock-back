import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
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
import { assertCanAddStaff } from "../utils/planLimits.js";

async function listUsers(req, res, next) {
  try {
    let businessId = req.user.businessId;
    if (req.user.role === "superadmin" && req.query.businessId) {
      businessId = req.query.businessId;
    }
    const { outletId, role, isActive } = req.query;
    const query = {};
    if (businessId) query.businessId = businessId;
    if (outletId) query.outletIds = outletId;
    if (role) query.role = role;
    if (isActive !== void 0) query.isActive = isActive === "true";

    const users = await User.find(query)
      .select("-passwordHash -inviteToken")
      .populate("roleId", "name permissions")
      .sort({ name: 1 })
      .lean();

    return successResponse({
      res: res,

      data: {
        users
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function getUser(req, res, next) {
  try {
    const { businessId } = req.user;
    const user = await User.findOne({ _id: req.params.id, businessId })
      .select("-passwordHash -inviteToken")
      .populate("roleId", "name permissions outletScope outletIds")
      .lean();

    if (!user) return errorResponse({
      res: res,
      statusCode: 404,
      message: "User not found"
    });
    return successResponse({
      res: res,

      data: {
        user
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function createUser(req, res, next) {
  try {
    const canAdd = await assertCanAddStaff(req, res);
    if (!canAdd) return;

    const { businessId } = req.user;
    const { name, phone, email, password, role, roleId, outletIds } = req.body;

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) return errorResponse({
      res: res,
      statusCode: 409,
      message: "Phone number already exists"
    });

    if (email) {
      const existingEmail = await User.findOne({ email: email.toLowerCase() });
      if (existingEmail) return errorResponse({
        res: res,
        statusCode: 409,
        message: "Email already exists"
      });
    }

    if (roleId) {
      const targetRole = await Role.findOne({ _id: roleId, businessId }).lean();
      if (!targetRole) return errorResponse({
        res: res,
        statusCode: 404,
        message: "Role not found"
      });
      const ok = await canAssignPermissions(req, targetRole.permissions);
      if (!ok) {
        return errorResponse({
          res: res,
          statusCode: 403,
          message: "Cannot assign role with permissions you don't have"
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      businessId,
      name,
      phone,
      email,
      role: role || "staff",
      roleId: roleId || null,
      outletIds: outletIds || [],
      passwordHash,
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

    const clean = { ...user.toObject(), passwordHash: void 0 };
    return successResponse({
      res: res,
      statusCode: 201,

      data: {
        user: clean
      }
    });
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

    if (req.body.password) {
      update.passwordHash = await bcrypt.hash(req.body.password, 10);
    }

    if (update.roleId) {
      const targetRole = await Role.findOne({ _id: update.roleId, businessId }).lean();
      if (!targetRole) return errorResponse({
        res: res,
        statusCode: 404,
        message: "Role not found"
      });
      const ok = await canAssignPermissions(req, targetRole.permissions);
      if (!ok) {
        return errorResponse({
          res: res,
          statusCode: 403,
          message: "Cannot assign role with permissions you don't have"
        });
      }
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, businessId },
      { $set: update },
      { new: true }
    ).select("-passwordHash -inviteToken");

    if (!user) return errorResponse({
      res: res,
      statusCode: 404,
      message: "User not found"
    });
    return successResponse({
      res: res,

      data: {
        user
      }
    });
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
    if (!user) return errorResponse({
      res: res,
      statusCode: 404,
      message: "User not found"
    });
    return successResponse({
      res: res,
      message: "User deactivated"
    });
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
      if (!targetRole) return errorResponse({
        res: res,
        statusCode: 404,
        message: "Role not found"
      });
      const ok = await canAssignPermissions(req, targetRole.permissions);
      if (!ok) {
        return errorResponse({
          res: res,
          statusCode: 403,
          message: "Cannot invite with a role you can't assign"
        });
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

    return successResponse({
      res: res,
      statusCode: 201,

      data: {
        invite,
        inviteLink
      }
    });
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

    if (!invite) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Invite not found or already used"
    });
    if (new Date() > invite.expiresAt) return errorResponse({
      res: res,
      statusCode: 410,
      message: "Invite expired"
    });

    return successResponse({
      res: res,

      data: {
        invite,
        businessName: invite.businessId?.name
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function acceptInvite(req, res, next) {
  try {
    const invite = await Invite.findOne({ token: req.params.token, usedAt: null });
    if (!invite) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Invite not found or already used"
    });
    if (new Date() > invite.expiresAt) return errorResponse({
      res: res,
      statusCode: 410,
      message: "Invite expired"
    });

    const { name, password } = req.body;
    const existingPhone = invite.phone ? await User.findOne({ phone: invite.phone }) : null;
    if (existingPhone) return errorResponse({
      res: res,
      statusCode: 409,
      message: "Phone number already registered on the platform"
    });
    const existingEmail = invite.email ? await User.findOne({ email: invite.email }) : null;
    if (existingEmail) return errorResponse({
      res: res,
      statusCode: 409,
      message: "Email already registered on the platform"
    });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      businessId: invite.businessId,
      name,
      phone: invite.phone,
      email: invite.email,
      role: invite.role,
      roleId: invite.roleId || null,
      outletIds: invite.outletIds || [],
      passwordHash,
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

    return successResponse({
      res: res,
      statusCode: 201,

      data: {
        token: jwtToken,

        user: {
          id: user._id,
          name: user.name,
          role: user.role,
          businessId: invite.businessId,
          outletId: invite.outletIds?.[0] || null,
          outletIds: invite.outletIds || []
        }
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
