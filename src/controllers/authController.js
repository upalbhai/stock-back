import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { Business } from "../models/Business.js";
import { Outlet } from "../models/Outlet.js";
import { Role } from "../models/Role.js";
import { AuditLog } from "../models/AuditLog.js";
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "biz";
}
function makeOutletCode(name) {
  return slugify(name).slice(0, 12) || "outlet";
}
function createToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}
async function register(req, res, next) {
  try {
    const {
      name,
      phone,
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
        maxOutlets: 1
      });
      const outlet = await Outlet.create({
        businessId: business._id,
        name: outletName || businessName,
        code: makeOutletCode(outletName || businessName)
      });
      finalOutletId = outlet._id.toString();
    }
    const pinHash = await bcrypt.hash(pin, 10);
    const user = await User.create({
      name,
      phone,
      role: "owner",
      businessId: business?._id,
      outletIds: [finalOutletId],
      pinHash
    });
    if (business) {
      await Business.findByIdAndUpdate(business._id, { ownerId: user._id });
    }
    if (business) {
      await createDefaultRoles(business._id.toString());
    }
    const token = createToken({
      userId: user._id.toString(),
      role: user.role,
      businessId: business?._id?.toString(),
      outletId: finalOutletId,
      outletIds: [finalOutletId]
    });
    await AuditLog.create({
      businessId: business?._id,
      actorId: user._id,
      actorName: user.name,
      actorRole: user.role,
      module: "auth",
      action: "register",
      message: `New owner registered: ${user.name}`,
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    });
    return res.status(201).json({
      token,
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
  register
};
