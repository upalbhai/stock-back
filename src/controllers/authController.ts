import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { Outlet } from "../models/Outlet.js";

function makeOutletCode(name: string) {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 12) || "outlet";
}

function createToken(user: { _id: string; role: string; outletId?: string }) {
  return jwt.sign(
    { userId: user._id, role: user.role, outletId: user.outletId },
    env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { name, phone, pin, role, outletId, outletName } = req.body;

    if (!outletId && !outletName) {
      return res
        .status(400)
        .json({ message: "Outlet id or name is required" });
    }

    const existing = await User.findOne({ phone });
    if (existing) {
      return res.status(409).json({ message: "User already exists" });
    }

    let finalOutletId = outletId;
    if (!finalOutletId && outletName) {
      const outlet = await Outlet.create({
        name: outletName,
        code: makeOutletCode(outletName)
      });
      finalOutletId = outlet._id.toString();
    }

    const pinHash = await bcrypt.hash(pin, 10);
    const user = await User.create({
      name,
      phone,
      role,
      outletId: finalOutletId,
      pinHash
    });

    const token = createToken({
      _id: user._id.toString(),
      role: user.role,
      outletId: user.outletId?.toString()
    });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        outletId: user.outletId
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { phone, pin } = req.body;

    const user = await User.findOne({ phone, isActive: true });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(pin, user.pinHash);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = createToken({
      _id: user._id.toString(),
      role: user.role,
      outletId: user.outletId?.toString()
    });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        outletId: user.outletId
      }
    });
  } catch (error) {
    next(error);
  }
}
