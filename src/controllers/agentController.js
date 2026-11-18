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

    const { PayoutRequest } = await import("../models/PayoutRequest.js");
    const pendingRequests = await PayoutRequest.find({ agentId, status: "pending" }).lean();

    return successResponse({
      res,
      data: {
        totalSales: profile.totalSales,
        wallets: profile.wallets,
        pendingRequests,
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
      .select("name email phone status subscriptionStatus customPlanDetails pendingCustomPlan lastPlanRequestStatus createdAt ownerId")
      .populate("ownerId", "name email phone")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const formattedClients = clients.map((c) => ({
      ...c,
      email: c.email || c.ownerId?.email || "",
      phone: c.phone || c.ownerId?.phone || ""
    }));

    return successResponse({
      res,
      data: { clients: formattedClients },
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
    
    // Instead of applying directly, store as pending request
    business.pendingCustomPlan = {
      price,
      currency: curr,
      maxProducts: maxProducts || business.maxProducts,
      maxOutlets: maxOutlets || business.maxOutlets,
      enabledFeatures: enabledFeatures || business.enabledFeatures,
      requestedAt: new Date(),
      requestedBy: agentId
    };

    await business.save();

    // Log the request
    const { AuditLog } = await import("../models/AuditLog.js");
    await AuditLog.create({
      businessId: business._id,
      actorId: agentId,
      module: "billing",
      action: "agent_plan_change_requested",
      message: `Agent requested custom plan change. Pending admin approval.`,
      ip: req.ip
    });

    return successResponse({ res, message: "Custom plan change requested. Pending admin approval.", data: { pendingCustomPlan: business.pendingCustomPlan } });
  } catch (error) {
    next(error);
  }
}

// 6. Request Payout
export async function requestPayout(req, res, next) {
  try {
    const { currency, amount } = req.body;
    const agentId = req.user.userId;

    if (!currency || !amount || amount <= 0) {
      return errorResponse({ res, statusCode: 400, message: "Valid currency and amount are required" });
    }

    const { AgentProfile } = await import("../models/AgentProfile.js");
    const { PayoutRequest } = await import("../models/PayoutRequest.js");

    const profile = await AgentProfile.findOne({ userId: agentId });
    if (!profile) {
      return errorResponse({ res, statusCode: 404, message: "Profile not found" });
    }

    const wallet = profile.wallets.find(w => w.currency === currency);
    if (!wallet) {
      return errorResponse({ res, statusCode: 400, message: `No wallet found for currency ${currency}` });
    }

    const existingRequests = await PayoutRequest.aggregate([
      { $match: { agentId, currency, status: "pending" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const pendingRequestedAmount = existingRequests[0]?.total || 0;

    const availableToRequest = wallet.pending - pendingRequestedAmount;

    if (availableToRequest < amount) {
      return errorResponse({ res, statusCode: 400, message: `Insufficient pending balance. Available to request: ${availableToRequest}` });
    }

    // Create the payout request
    const request = await PayoutRequest.create({
      agentId,
      currency,
      amount
    });

    return successResponse({ res, statusCode: 201, message: "Payout request submitted successfully", data: request });
  } catch (error) {
    next(error);
  }
}

// 7. Get Plan Request History
export async function getPlanRequestHistory(req, res, next) {
  try {
    const { businessId } = req.params;
    const agentId = req.user.userId;

    // Verify the agent owns this business
    const { Business } = await import("../models/Business.js");
    const business = await Business.findOne({ _id: businessId, agentId });
    if (!business) {
      return errorResponse({ res, statusCode: 404, message: "Client not found or you don't have permission" });
    }

    const { AuditLog } = await import("../models/AuditLog.js");
    const logs = await AuditLog.find({
      businessId,
      action: { $in: ["agent_plan_change_requested", "admin_approved_plan", "admin_rejected_plan"] }
    }).sort({ createdAt: -1 }).lean();

    return successResponse({ res, data: { logs } });
  } catch (error) {
    next(error);
  }
}

// 8. Get Wallet History
export async function getAgentWalletHistory(req, res, next) {
  try {
    const agentId = req.user.userId;
    const { currency } = req.query;

    const query = { agentId };
    if (currency) {
      query.currency = currency;
    }

    const { AgentTransaction } = await import("../models/AgentTransaction.js");
    
    const transactions = await AgentTransaction.find(query)
      .sort({ createdAt: -1 })
      .limit(100) // limit to recent 100 for now
      .lean();

    return successResponse({ res, data: { transactions } });
  } catch (error) {
    next(error);
  }
}
