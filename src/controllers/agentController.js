import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { User } from "../models/User.js";
import { AgentProfile } from "../models/AgentProfile.js";
import { Business } from "../models/Business.js";
import { Outlet } from "../models/Outlet.js";
import { withTransaction } from "../utils/transaction.js";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "biz";
}

// 1. Agent Registration
export async function registerAgent(req, res, next) {
  try {
    return await withTransaction(async (session) => {
      const { name, email, phone, password } = req.body;

      const existingUser = await User.findOne({ email: email.toLowerCase() }).session(session);
      if (existingUser) {
        return errorResponse({ res, statusCode: 409, message: "Email already in use" });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const userId = new mongoose.Types.ObjectId();

      const agent = await new User({
        _id: userId,
        name,
        email: email.toLowerCase(),
        phone,
        passwordHash,
        role: "agent",
        status: "pending_approval",
        emailVerified: false // Real app would send OTP here
      }).save({ session });

      await new AgentProfile({
        userId: agent._id
      }).save({ session });

      return successResponse({ res, statusCode: 201, message: "Agent registration successful. Pending admin approval." });
    });
  } catch (error) {
    next(error);
  }
}

// 2. Get Agent Stats
export async function getAgentStats(req, res, next) {
  try {
    const agentId = req.user.userId;
    const profile = await AgentProfile.findOne({ userId: agentId }).lean();
    if (!profile) return errorResponse({ res, statusCode: 404, message: "Profile not found" });

    const clientsCount = await Business.countDocuments({ agentId });

    return successResponse({
      res,
      data: {
        totalSales: profile.totalSales,
        wallets: profile.wallets,
        commissionPercentage: profile.commissionPercentage,
        activeClients: clientsCount,
        agentCode: profile.agentCode
      }
    });
  } catch (error) {
    next(error);
  }
}

// 3. Get Agent Clients
export async function getAgentClients(req, res, next) {
  try {
    const agentId = req.user.userId;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const search = req.query.search?.trim();

    const query = { agentId };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } }
      ];
    }

    const total = await Business.countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;

    const clients = await Business.find(query)
      .select("name email phone status subscriptionStatus customPlanDetails createdAt")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return successResponse({
      res,
      data: { clients },
      meta: {
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

// 4. Create Client (White-Glove)
export async function createClient(req, res, next) {
  try {
    return await withTransaction(async (session) => {
      const { businessName, ownerName, email, phone } = req.body;
      const agentId = req.user.userId;

      const existingUser = await User.findOne({ email: email.toLowerCase() }).session(session);
      if (existingUser) {
        return errorResponse({ res, statusCode: 409, message: "User with this email already exists" });
      }

      const userId = new mongoose.Types.ObjectId();
      const bSlug = slugify(businessName);
      const bCode = `${bSlug}-${uuidv4().slice(0, 4)}`;
      const now = new Date();
      const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 day trial

      const business = await new Business({
        name: businessName,
        code: bCode,
        slug: bCode,
        ownerId: userId,
        agentId,
        billingMethod: "manual",
        subscriptionStatus: "trial",
        trialStartedAt: now,
        trialEndsAt: trialEnd,
        customPlanDetails: {
          price: 0, // Agent configures later
          maxProducts: 50,
          maxOutlets: 1,
          enabledFeatures: []
        },
        status: "active",
        isActive: true
      }).save({ session });

      const outlet = await new Outlet({
        businessId: business._id,
        name: "Main Outlet",
        code: `MAIN-${uuidv4().slice(0, 4)}`,
        status: "active",
        isActive: true
      }).save({ session });

      await new User({
        _id: userId,
        name: ownerName,
        email: email.toLowerCase(),
        phone,
        role: "owner",
        businessId: business._id,
        outletIds: [outlet._id],
        isActive: true
      }).save({ session });

      // In real app, send email with password setup link here

      return successResponse({ res, statusCode: 201, message: "Client created successfully", data: { businessId: business._id } });
    });
  } catch (error) {
    next(error);
  }
}

// 5. Update Custom Plan (Builder)
export async function updateCustomPlan(req, res, next) {
  try {
    const { businessId } = req.params;
    const { price, currency, maxProducts, maxOutlets, enabledFeatures } = req.body;
    const agentId = req.user.userId;

    const business = await Business.findOne({ _id: businessId, agentId });
    if (!business) {
      return errorResponse({ res, statusCode: 404, message: "Client not found or you don't have permission" });
    }

    const curr = currency || "INR";
    const baseMins = { INR: 500, USD: 10, EUR: 10, GBP: 8, AED: 30 };
    const prodIncrements = { INR: 10, USD: 0.1, EUR: 0.1, GBP: 0.1, AED: 0.5 };
    
    const baseMin = baseMins[curr] || 500;
    const prodInc = prodIncrements[curr] || 10;
    
    // Floor pricing validation
    const extraProducts = Math.max(0, (maxProducts || 50) - 50); // First 50 included in base
    const minPrice = baseMin + Math.floor(extraProducts / 10) * prodInc;
    
    if (price < minPrice) {
      return errorResponse({ res, statusCode: 400, message: `Price too low. Minimum allowed for these limits is ${curr} ${minPrice.toFixed(2)}` });
    }
    business.customPlanDetails = {
      price,
      currency: currency || "INR",
      maxProducts,
      maxOutlets,
      enabledFeatures: enabledFeatures || []
    };

    if (enabledFeatures && Array.isArray(enabledFeatures)) {
      business.enabledFeatures = enabledFeatures;
    }
    if (maxProducts) business.maxProducts = maxProducts;
    if (maxOutlets) business.maxOutlets = maxOutlets;

    await business.save();

    return successResponse({ res, message: "Custom plan updated successfully", data: { customPlanDetails: business.customPlanDetails } });
  } catch (error) {
    next(error);
  }
}
