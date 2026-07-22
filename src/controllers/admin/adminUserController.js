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

export {
  createSystemAdmin
};
