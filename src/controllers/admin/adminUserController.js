import { successResponse } from "../../utils/successResponse.js";
import { errorResponse } from "../../utils/errorResponse.js";
import bcrypt from "bcryptjs";
import { User } from "../../models/User.js";
import { AuditLog } from "../../models/AuditLog.js";

async function createSystemAdmin(req, res, next) {
  try {
    const { name, phone, email, customPermissions, password } = req.body;

    if (!name || !email || !password) {
      return errorResponse({ res, statusCode: 400, message: "Name, email, and password are required" });
    }

    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return errorResponse({ res, statusCode: 409, message: "Email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      phone,
      email: email.toLowerCase(),
      role: "superadmin",
      customPermissions: customPermissions || [],
      passwordHash,
      emailVerified: true 
    });

    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "create_system_admin",
      message: `Created new system admin: ${user.email}`,
      ip: req.ip
    });

    const cleanUser = { ...user.toObject(), passwordHash: undefined };
    return successResponse({ res, statusCode: 201, data: { user: cleanUser } });
  } catch (error) {
    return next(error);
  }
}

import { EmailOtp } from "../../models/EmailOtp.js";

async function getOtpLogs(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      EmailOtp.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.min(limit, 100))
        .lean(),
      EmailOtp.countDocuments()
    ]);

    return successResponse({ res, data: { logs, total } });
  } catch (error) {
    return next(error);
  }
}

async function adminChangeUserPassword(req, res, next) {
  try {
    const { newPassword } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) return errorResponse({ res, statusCode: 404, message: "User not found" });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "change_user_password",
      targetType: "User",
      targetId: user._id,
      targetName: user.name,
      message: `System admin changed password for user: ${user.email}`,
      ip: req.ip
    });

    return successResponse({ res, message: "Password updated successfully" });
  } catch (error) {
    return next(error);
  }
}

export {
  createSystemAdmin,
  getOtpLogs,
  adminChangeUserPassword
};
