import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { Business } from "../models/Business.js";
import { Outlet } from "../models/Outlet.js";
import { Role } from "../models/Role.js";
import { AuditLog } from "../models/AuditLog.js";
import { EmailOtp } from "../models/EmailOtp.js";
import mailer from "../utils/mailer.js";
import crypto from "crypto";
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "biz";
}
function makeOutletCode(name) {
  return slugify(name).slice(0, 12) || "outlet";
}
function createToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}

function makeCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
async function register(req, res, next) {
  try {
    const {
      name,
      phone,
      email,
      pin,
      businessName,
      outletName,
      outletId
    } = req.body;
    if (!businessName && !outletId) {
      return res.status(400).json({ message: "businessName or outletId is required" });
    }
    const existing = await User.findOne({ phone });
    if (existing) {
      return res.status(409).json({ message: "User already exists" });
    }
    let business;
    let finalOutletId = outletId;
    if (!outletId && businessName) {
      const bSlug = slugify(businessName);
      const bCode = `${bSlug}-${uuidv4().slice(0, 4)}`;
      business = await Business.create({
        name: businessName,
        code: bCode,
        slug: bCode,
        plan: "free",
        maxOutlets: 1,
        status: "pending"
      });
      const outlet = await Outlet.create({
        businessId: business._id,
        name: outletName || businessName,
        code: makeOutletCode(outletName || businessName),
        status: business.status === "active" ? "active" : "pending",
        isActive: business.status === "active"
      });
      finalOutletId = outlet._id.toString();
    }
    const pinHash = await bcrypt.hash(pin, 10);
    const user = await User.create({
      name,
      phone,
      email: email?.toLowerCase(),
      role: "owner",
      businessId: business?._id,
      outletIds: [finalOutletId],
      pinHash,
      isActive: false
    });
    if (business) {
      await Business.findByIdAndUpdate(business._id, { ownerId: user._id });
    }
    await AuditLog.create({
      businessId: business?._id,
      actorId: user._id,
      actorName: user.name,
      actorRole: user.role,
      module: "auth",
      action: "register",
      message: `New owner registered (awaiting approval): ${user.name}`,
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    });
    // send confirmation email to owner (if email provided)
    if (req.body.email) {
      try {
        await mailer.sendRegistrationSubmitted(req.body.email, businessName);
      } catch (e) {
        console.warn("Failed to send registration email", e.message);
      }
    }
    return res.status(201).json({
      message: "Registration submitted. Awaiting admin approval.",
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        businessId: business?._id,
        outletId: finalOutletId,
        outletIds: [finalOutletId]
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function login(req, res, next) {
  try {
    const { phone, pin } = req.body;
    const user = await User.findOne({ phone, isActive: true }).populate("roleId").lean();
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const isValid = await bcrypt.compare(pin, user.pinHash);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    await User.findByIdAndUpdate(user._id, {
      lastLoginAt: /* @__PURE__ */ new Date(),
      lastLoginIp: req.ip,
      lastLoginDevice: req.headers["user-agent"]?.slice(0, 200)
    });
    const primaryOutletId = user.outletIds?.[0]?.toString() || void 0;
    const token = createToken({
      userId: user._id.toString(),
      role: user.role,
      businessId: user.businessId?.toString(),
      outletId: primaryOutletId,
      outletIds: user.outletIds?.map((id) => id.toString()) || [],
      roleId: user.roleId?.toString()
    });
    await AuditLog.create({
      businessId: user.businessId,
      actorId: user._id,
      actorName: user.name,
      actorRole: user.role,
      module: "auth",
      action: "login",
      message: `User logged in`,
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    });
    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        businessId: user.businessId,
        outletId: primaryOutletId,
        outletIds: user.outletIds?.map((id) => id.toString()) || []
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user?.userId).select("-pinHash -inviteToken").populate("roleId", "name permissions outletScope outletIds").lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
}
async function createDefaultRoles(businessId) {
  const defaultRoles = [
    {
      name: "Manager",
      description: "Full access to outlet operations",
      isSystem: true,
      permissions: [
        { module: "billing", actions: ["create", "read", "update", "refund", "print"] },
        { module: "inventory", actions: ["create", "read", "update"] },
        { module: "products", actions: ["create", "read", "update"] },
        { module: "reports", actions: ["read", "export"] },
        { module: "expenses", actions: ["create", "read"] },
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
export {
  getMe,
  login,
  register,
  createDefaultRoles
};

async function sendLoginOtp(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });
    const code = makeCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await EmailOtp.create({ email: email.toLowerCase(), code, type: "login", expiresAt });
    try {
      await mailer.sendOtpEmail(email, code);
    } catch (e) {
      console.warn("Failed to send OTP email", e.message);
    }
    return res.json({ message: "OTP sent" });
  } catch (error) {
    return next(error);
  }
}

async function verifyLoginOtp(req, res, next) {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: "Email and code are required" });
    const otp = await EmailOtp.findOne({ email: email.toLowerCase(), code, used: false });
    if (!otp) return res.status(400).json({ message: "Invalid code" });
    if (new Date() > otp.expiresAt) return res.status(410).json({ message: "Code expired" });
    otp.used = true;
    await otp.save();
    // find user by email
    const user = await User.findOne({ email: email.toLowerCase() }).populate("roleId");
    if (!user) return res.status(404).json({ message: "No user found for this email" });
    // mark email verified for user
    if (!user.emailVerified) {
      user.emailVerified = true;
      await user.save();
    }
    // if user not active yet, return informative message
    if (!user.isActive) {
      return res.json({ message: "Email verified. Account awaiting admin approval." });
    }
    // ensure business and outlet active
    if (user.businessId) {
      const biz = await Business.findById(user.businessId).lean();
      if (biz && biz.status !== "active") return res.status(403).json({ message: "Business not active" });
    }
    const primaryOutletId = user.outletIds?.[0]?.toString() || void 0;
    const token = createToken({
      userId: user._id.toString(),
      role: user.role,
      businessId: user.businessId?.toString(),
      outletId: primaryOutletId,
      outletIds: user.outletIds?.map((id) => id.toString()) || [],
      roleId: user.roleId?.toString()
    });
    await AuditLog.create({
      businessId: user.businessId,
      actorId: user._id,
      actorName: user.name,
      actorRole: user.role,
      module: "auth",
      action: "otp_login",
      message: `User logged in via OTP`,
      ip: req.ip
    });
    return res.json({ token, user: { id: user._id, name: user.name, role: user.role, businessId: user.businessId } });
  } catch (error) {
    return next(error);
  }
}

export { sendLoginOtp, verifyLoginOtp };
