import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { Business } from "../models/Business.js";
import { PLAN_FEATURE_TEMPLATES } from "../config/features.js";
import { getBusinessContextFromDoc } from "../utils/syncBusinessPlan.js";
import { Plan } from "../models/Plan.js";
import { Outlet } from "../models/Outlet.js";
import { Role } from "../models/Role.js";
import { AuditLog } from "../models/AuditLog.js";
import { EmailOtp } from "../models/EmailOtp.js";
import { Session } from "../models/Session.js";
import mailer from "../utils/mailer.js";
import crypto from "crypto";
import { parseDevice } from "../utils/parseDevice.js";
import { resolveLocation } from "../utils/geoip.js";
import { seedStandardUnits } from "../seeders/standardUnits.js";

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "biz";
}
function makeOutletCode(name) {
  return slugify(name).slice(0, 12) || "outlet";
}

async function buildAuthUserResponse(user, subscriptionOverrides = {}) {
  const primaryOutletId = user.outletIds?.[0]?.toString() || undefined;
  let subscriptionStatus = subscriptionOverrides.subscriptionStatus ?? null;
  let trialEndsAt = subscriptionOverrides.trialEndsAt ?? null;
  let trialExpired = subscriptionOverrides.trialExpired ?? false;
  let enabledFeatures = null;
  let businessProfile = null;
  let planType = null;

  if (user.businessId && user.role !== "superadmin") {
    const biz = await Business.findById(user.businessId)
      .select("subscriptionStatus trialEndsAt planId planType businessProfile enabledFeatures")
      .lean();
    if (biz) {
      if (subscriptionStatus === null) subscriptionStatus = biz.subscriptionStatus;
      if (trialEndsAt === null) trialEndsAt = biz.trialEndsAt;
      let plan = null;
      if (biz.planId) {
        plan = await Plan.findById(biz.planId).select("planType featureKeys").lean();
      }
      const ctx = getBusinessContextFromDoc(biz, plan);
      enabledFeatures = ctx.enabledFeatures;
      businessProfile = ctx.businessProfile;
      planType = ctx.planType;
    }
  }

  return {
    id: user._id,
    name: user.name,
    role: user.role,
    businessId: user.businessId,
    outletId: primaryOutletId,
    outletIds: user.outletIds?.map((id) => id.toString()) || [],
    subscriptionStatus,
    trialEndsAt,
    trialExpired,
    enabledFeatures,
    businessProfile,
    planType
  };
}

function createToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}
function makeCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function createAndSendLoginOtp(email) {
  const normalizedEmail = email.toLowerCase();
  const code = makeCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const otp = await EmailOtp.create({
    email: normalizedEmail,
    code,
    type: "login",
    expiresAt
  });

  try {
    await mailer.sendOtpEmail(normalizedEmail, code);
  } catch (error) {
    await EmailOtp.findByIdAndDelete(otp._id).catch((deleteError) => {
      console.warn("Failed to delete unsent OTP", deleteError.message);
    });
    throw error;
  }
}

/**
 * Create a login session, detect new devices, and send alert emails.
 * Returns { token, session } where token includes sessionId.
 */
async function createLoginSession({ user, req, tokenPayload }) {
  const userAgent = req.headers["user-agent"] || "";
  const ip = req.ip || req.connection?.remoteAddress || "";
  const device = parseDevice(userAgent);
  const location = await resolveLocation(ip);

  // Create JWT with a placeholder sessionId (we'll update after session creation)
  const sessionId = new mongoose.Types.ObjectId();
  const token = createToken({ ...tokenPayload, sessionId: sessionId.toString() });
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Create session document
  const session = await Session.create({
    _id: sessionId,
    userId: user._id,
    tokenHash,
    deviceName: device.deviceName,
    deviceType: device.deviceType,
    browser: device.browser,
    os: device.os,
    ip,
    location,
    lastActiveAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  });

  // Detect new device: check if user has logged in with this deviceName before
  try {
    const previousSession = await Session.findOne({
      userId: user._id,
      deviceName: device.deviceName,
      _id: { $ne: sessionId }
    });

    if (!previousSession && user.email) {
      // New device — send alert email (non-blocking)
      mailer.sendNewDeviceLoginEmail(user.email, user.name, {
        deviceName: device.deviceName,
        location,
        ip,
        time: new Date()
      }).catch((e) => console.warn("Failed to send new device login email", e.message));
    }
  } catch (e) {
    console.warn("New device check failed", e.message);
  }

  // Update user last login info
  await User.findByIdAndUpdate(user._id, {
    lastLoginAt: new Date(),
    lastLoginIp: ip,
    lastLoginDevice: userAgent.slice(0, 200)
  });

  return { token, session };
}

// ---------- REGISTER (email + password, auto-trial) ----------
async function register(req, res, next) {
  try {
    const { name, email, password, phone, businessName, outletName, outletId } = req.body;

    if (!businessName && !outletId) {
      return errorResponse({
        res: res,
        statusCode: 400,
        message: "businessName or outletId is required"
      });
    }

    // Check existing by email
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return errorResponse({
        res: res,
        statusCode: 409,
        message: "An account with this email already exists"
      });
    }

    // Check existing by phone if provided
    if (phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return errorResponse({
          res: res,
          statusCode: 409,
          message: "An account with this phone already exists"
        });
      }
    }

    let business;
    let finalOutletId = outletId;
    const userId = new mongoose.Types.ObjectId();

    if (!outletId && businessName) {
      const bSlug = slugify(businessName);
      const bCode = `${bSlug}-${uuidv4().slice(0, 4)}`;
      const now = new Date();
      const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

      business = await Business.create({
        name: businessName,
        code: bCode,
        slug: bCode,
        ownerId: userId,
        plan: "free",
        planType: "retail",
        businessProfile: "retail",
        enabledFeatures: PLAN_FEATURE_TEMPLATES.retail,
        maxOutlets: 1,
        maxStaff: 5,
        maxProducts: 50,
        status: "active",
        isActive: true,
        subscriptionStatus: "trial",
        trialStartedAt: now,
        trialEndsAt: trialEnd,
        approvedAt: now
      });

      const outlet = await Outlet.create({
        businessId: business._id,
        name: outletName || businessName,
        code: makeOutletCode(outletName || businessName),
        status: "active",
        isActive: true
      });

      finalOutletId = outlet._id.toString();
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;

    const user = await User.create({
      _id: userId,
      name,
      phone: phone || undefined,
      email: email.toLowerCase(),
      role: "owner",
      businessId: business?._id,
      outletIds: [finalOutletId],
      passwordHash,
      isActive: true,
      emailVerified: false
    });

    // We don't need to findByIdAndUpdate ownerId anymore since we passed it in creation

    // Create default roles
    if (business) {
      await createDefaultRoles(business._id.toString());
      try {
        await seedStandardUnits(business._id.toString());
      } catch (e) {
        console.warn("Seeding standard units failed", e.message);
      }
    }

    await AuditLog.create({
      businessId: business?._id,
      actorId: user._id,
      actorName: user.name,
      actorRole: user.role,
      module: "auth",
      action: "register",
      message: `New owner registered with 7-day trial: ${user.name}`,
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    });

    // Send welcome email
    try {
      const trialEnd = business?.trialEndsAt;
      await mailer.sendWelcomeEmail(email, name, trialEnd);
    } catch (e) {
      console.warn("Failed to send welcome email", e.message);
    }

    // Send email verification OTP
    try {
      const code = makeCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await EmailOtp.create({ email: email.toLowerCase(), code, type: "login", expiresAt });
      await mailer.sendOtpEmail(email, code);
    } catch (e) {
      console.warn("Failed to send verification OTP", e.message);
    }

    // We no longer return the token instantly here so they are forced to verify their email
    return successResponse({
      res: res,
      statusCode: 201,
      message: "Registration successful. Please check your email for the verification code."
    });
  } catch (error) {
    return next(error);
  }
}

// ---------- LOGIN WITH EMAIL + PASSWORD ----------
async function loginWithEmail(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase(), isActive: true }).populate("roleId").lean();

    if (!user) {
      return errorResponse({
        res: res,
        statusCode: 401,
        message: "Invalid email or password"
      });
    }
    if (!user.passwordHash) {
      return errorResponse({
        res: res,
        statusCode: 401,
        message: "Password login not set up. Use OTP login instead."
      });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return errorResponse({
        res: res,
        statusCode: 401,
        message: "Invalid email or password"
      });
    }

    // Check subscription status
    let subscriptionStatus = null;
    let trialEndsAt = null;
    let trialExpired = false;

    if (user.businessId && user.role !== "superadmin") {
      const biz = await Business.findById(user.businessId).lean();
      if (biz) {
        subscriptionStatus = biz.subscriptionStatus;
        trialEndsAt = biz.trialEndsAt;

        if (biz.subscriptionStatus === "trial" && biz.trialEndsAt && new Date() > new Date(biz.trialEndsAt)) {
          trialExpired = true;
          await Business.findByIdAndUpdate(biz._id, { subscriptionStatus: "expired" });
          subscriptionStatus = "expired";
        }
        if (biz.subscriptionStatus === "expired") {
          trialExpired = true;
        }
        if (biz.subscriptionStatus === "active" && biz.currentPeriodEnd && new Date() > new Date(biz.currentPeriodEnd)) {
          await Business.findByIdAndUpdate(biz._id, { subscriptionStatus: "expired" });
          subscriptionStatus = "expired";
          trialExpired = true;
        }
      }
    }

    const primaryOutletId = user.outletIds?.[0]?.toString() || undefined;
    const { token } = await createLoginSession({
      user,
      req,
      tokenPayload: {
        userId: user._id.toString(),
        role: user.role,
        businessId: user.businessId?.toString(),
        outletId: primaryOutletId,
        outletIds: user.outletIds?.map((id) => id.toString()) || [],
        roleId: user.roleId?.toString()
      }
    });

    await AuditLog.create({
      businessId: user.businessId,
      actorId: user._id,
      actorName: user.name,
      actorRole: user.role,
      module: "auth",
      action: "login",
      message: "User logged in via email+password",
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    });

    return successResponse({
      res: res,

      data: {
        token,
        user: await buildAuthUserResponse(user, { subscriptionStatus, trialEndsAt, trialExpired })
      }
    });
  } catch (error) {
    return next(error);
  }
}

// ---------- GET ME ----------
async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user?.userId).select("-passwordHash -inviteToken").populate("roleId", "name permissions outletScope outletIds").lean();
    if (!user) {
      return errorResponse({
        res: res,
        statusCode: 404,
        message: "User not found"
      });
    }

    // Include subscription + plan features
    const authUser = await buildAuthUserResponse(user);

    return successResponse({
      res: res,

      data: {
        user: {
          ...user,
          id: user._id,
          ...authUser,
          roleId: user.roleId
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

// ---------- CHECK EMAIL FOR AUTH METHOD ----------
async function checkEmail(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) return errorResponse({
      res: res,
      statusCode: 400,
      message: "Email is required"
    });
    
    const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
    if (!user) {
      return errorResponse({
        res: res,
        statusCode: 404,
        message: "No account found with this email"
      });
    }

    if (!user.emailVerified) {
      await createAndSendLoginOtp(email);
      return successResponse({
        res: res,
        message: "Email not verified. OTP sent to your email.",

        data: {
          method: "otp"
        }
      });
    }

    if (user.passwordHash) {
      return successResponse({
        res: res,

        data: {
          method: "password"
        }
      });
    }

    // If no password, generate and send OTP automatically
    await createAndSendLoginOtp(email);
    
    return successResponse({
      res: res,
      message: "OTP sent to your email",

      data: {
        method: "otp"
      }
    });
  } catch (error) {
    return next(error);
  }
}

// ---------- SEND OTP ----------
async function sendLoginOtp(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) return errorResponse({
      res: res,
      statusCode: 400,
      message: "Email is required"
    });
    await createAndSendLoginOtp(email);
    return successResponse({
      res: res,
      message: "OTP sent to your email"
    });
  } catch (error) {
    return next(error);
  }
}

// ---------- VERIFY OTP ----------
async function verifyLoginOtp(req, res, next) {
  try {
    const { email, code } = req.body;
    if (!email || !code) return errorResponse({
      res: res,
      statusCode: 400,
      message: "Email and code are required"
    });
    const otp = await EmailOtp.findOne({ email: email.toLowerCase(), code, used: false });
    if (!otp) return errorResponse({
      res: res,
      statusCode: 400,
      message: "Invalid code"
    });
    if (new Date() > otp.expiresAt) return errorResponse({
      res: res,
      statusCode: 410,
      message: "Code expired"
    });
    otp.used = true;
    await otp.save();

    const user = await User.findOne({ email: email.toLowerCase() }).populate("roleId");
    if (!user) return errorResponse({
      res: res,
      statusCode: 404,
      message: "No user found for this email"
    });

    if (!user.emailVerified) {
      user.emailVerified = true;
      await user.save();
    }
    if (!user.isActive) {
      return successResponse({
        res: res,
        message: "Email verified. Account awaiting activation."
      });
    }

    // Subscription check
    let subscriptionStatus = null;
    let trialEndsAt = null;
    let trialExpired = false;
    if (user.businessId && user.role !== "superadmin") {
      const biz = await Business.findById(user.businessId).lean();
      if (biz) {
        subscriptionStatus = biz.subscriptionStatus;
        trialEndsAt = biz.trialEndsAt;
        if (biz.subscriptionStatus === "trial" && biz.trialEndsAt && new Date() > new Date(biz.trialEndsAt)) {
          trialExpired = true;
          await Business.findByIdAndUpdate(biz._id, { subscriptionStatus: "expired" });
          subscriptionStatus = "expired";
        }
        if (biz.subscriptionStatus === "expired") trialExpired = true;
      }
    }

    const primaryOutletId = user.outletIds?.[0]?.toString() || undefined;
    const { token } = await createLoginSession({
      user,
      req,
      tokenPayload: {
        userId: user._id.toString(),
        role: user.role,
        businessId: user.businessId?.toString(),
        outletId: primaryOutletId,
        outletIds: user.outletIds?.map((id) => id.toString()) || [],
        roleId: user.roleId?.toString()
      }
    });

    await AuditLog.create({
      businessId: user.businessId,
      actorId: user._id,
      actorName: user.name,
      actorRole: user.role,
      module: "auth",
      action: "otp_login",
      message: "User logged in via email OTP",
      ip: req.ip
    });

    return successResponse({
      res: res,

      data: {
        token,
        user: await buildAuthUserResponse(user, { subscriptionStatus, trialEndsAt, trialExpired })
      }
    });
  } catch (error) {
    return next(error);
  }
}

// ---------- FORGOT PASSWORD ----------
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't leak user existence
      return successResponse({
        res: res,
        message: "If an account exists, a reset code has been sent"
      });
    }
    const code = makeCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await EmailOtp.create({ email: email.toLowerCase(), code, type: "login", expiresAt });
    try {
      await mailer.sendPasswordResetOtp(email, code);
    } catch (e) {
      console.warn("Failed to send password reset email", e.message);
    }
    return successResponse({
      res: res,
      message: "If an account exists, a reset code has been sent"
    });
  } catch (error) {
    return next(error);
  }
}

// ---------- RESET PASSWORD ----------
async function resetPassword(req, res, next) {
  try {
    const { email, code, newPassword } = req.body;
    const otp = await EmailOtp.findOne({ email: email.toLowerCase(), code, used: false });
    if (!otp) return errorResponse({
      res: res,
      statusCode: 400,
      message: "Invalid or expired code"
    });
    if (new Date() > otp.expiresAt) return errorResponse({
      res: res,
      statusCode: 410,
      message: "Code expired"
    });
    otp.used = true;
    await otp.save();

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return errorResponse({
      res: res,
      statusCode: 404,
      message: "User not found"
    });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    return successResponse({
      res: res,
      message: "Password reset successfully. You can now login."
    });
  } catch (error) {
    return next(error);
  }
}

// ---------- DEFAULT ROLES ----------
async function createDefaultRoles(businessId) {
  const defaultRoles = [
    {
      name: "Manager",
      description: "Full access to outlet operations",
      isSystem: true,
      permissions: [
        { module: "billing", actions: ["create", "read", "update", "refund", "void", "print"] },
        { module: "inventory", actions: ["create", "read", "update"] },
        { module: "products", actions: ["create", "read", "update"] },
        { module: "reports", actions: ["read", "export"] },
        { module: "expenses", actions: ["create", "read", "void"] },
        { module: "customers", actions: ["create", "read", "update", "collect"] },
        { module: "invoices", actions: ["create", "read", "print"] },
        { module: "dashboard", actions: ["read"] },
        { module: "categories", actions: ["read"] }
      ]
    },
    {
      name: "Cashier",
      description: "Billing only access",
      isSystem: true,
      permissions: [
        { module: "billing", actions: ["create", "read", "print"] },
        { module: "products", actions: ["read"] },
        { module: "categories", actions: ["read"] },
        { module: "dashboard", actions: ["read"] }
      ]
    },
    {
      name: "Inventory Staff",
      description: "Stock management access",
      isSystem: true,
      permissions: [
        { module: "inventory", actions: ["create", "read", "update"] },
        { module: "products", actions: ["read", "update"] },
        { module: "categories", actions: ["read"] },
        { module: "stock_transfers", actions: ["create", "read"] },
        { module: "dashboard", actions: ["read"] }
      ]
    }
  ];
  for (const role of defaultRoles) {
    await Role.create({ businessId, ...role });
  }
}

// ---------- SETUP / CHANGE PASSWORD ----------
async function setupPassword(req, res, next) {
  try {
    const { newPassword, oldPassword } = req.body;
    const user = await User.findById(req.user?.userId);

    if (!user) {
      return errorResponse({
        res,
        statusCode: 404,
        message: "User not found"
      });
    }

    // If user already has a password, verify it first
    if (user.passwordHash && !oldPassword) {
      return errorResponse({
        res,
        statusCode: 400,
        message: "Old password is required to change password"
      });
    }

    if (user.passwordHash && oldPassword) {
      const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
      if (!isValid) {
        return errorResponse({
          res,
          statusCode: 400,
          message: "Incorrect old password"
        });
      }
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    return successResponse({
      res: res,
      message: "Password set up successfully"
    });
  } catch (error) {
    next(error);
  }
}

export {
  getMe,
  loginWithEmail,
  checkEmail,
  register,
  createDefaultRoles,
  sendLoginOtp,
  verifyLoginOtp,
  forgotPassword,
  resetPassword,
  setupPassword
};
