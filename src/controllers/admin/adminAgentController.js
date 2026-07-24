import { successResponse } from "../../utils/successResponse.js";
import { errorResponse } from "../../utils/errorResponse.js";
import { User } from "../../models/User.js";
import { AgentProfile } from "../../models/AgentProfile.js";
import { EmailOtp } from "../../models/EmailOtp.js";
import bcrypt from "bcryptjs";
import mailer from "../../utils/mailer.js";
import { env } from "../../config/env.js";

// List all agents
export async function getAgents(req, res, next) {
  try {
    const agents = await User.find({ role: "agent" }).select("-passwordHash").lean();
    
    const profiles = await AgentProfile.find().lean();
    const profileMap = profiles.reduce((acc, p) => {
      acc[p.userId.toString()] = p;
      return acc;
    }, {});

    const result = agents.map(agent => ({
      ...agent,
      profile: profileMap[agent._id.toString()] || null
    }));

    return successResponse({ res, data: { agents: result } });
  } catch (error) {
    next(error);
  }
}

// Approve agent and update settings
export async function approveAgent(req, res, next) {
  try {
    const { agentId } = req.params;
    const { commissionPercentage, agentCode, status } = req.body;

    const agent = await User.findOne({ _id: agentId, role: "agent" });
    if (!agent) return errorResponse({ res, statusCode: 404, message: "Agent not found" });

    if (status) {
      agent.status = status;
    } else {
      agent.status = "active";
    }
    
    await agent.save();

    const profile = await AgentProfile.findOne({ userId: agentId });
    if (profile) {
      if (commissionPercentage !== undefined) profile.commissionPercentage = commissionPercentage;
      if (agentCode) profile.agentCode = agentCode;
      profile.approvedBy = req.user.userId;
      await profile.save();
    }

    return successResponse({ res, message: "Agent updated successfully" });
  } catch (error) {
    next(error);
  }
}

// Admin: Create new agent
export async function createAgent(req, res, next) {
  try {
    const { name, email, phone, password, commissionPercentage, agentCode } = req.body;

    if (!name || !email) {
      return errorResponse({ res, statusCode: 400, message: "Name and email are required" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return errorResponse({ res, statusCode: 409, message: "A user with this email already exists" });
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
    const preferredLoginMethod = password ? "password" : "otp";

    const agentUser = await new User({
      name,
      email: email.toLowerCase(),
      phone: phone || undefined,
      passwordHash,
      preferredLoginMethod,
      role: "agent",
      status: "active",
      isActive: true,
      emailVerified: false // Requires email verification before login
    }).save();

    const generatedCode = agentCode || `AGT-${name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const agentProfile = await new AgentProfile({
      userId: agentUser._id,
      agentCode: generatedCode,
      commissionPercentage: commissionPercentage !== undefined && commissionPercentage !== "" ? Number(commissionPercentage) : 20,
      approvedBy: req.user.userId
    }).save();

    // Generate OTP & construct direct login link
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await new EmailOtp({ email: email.toLowerCase(), code, type: "login", expiresAt }).save();
      
      const frontendUrl = process.env.FRONTEND_URL || env.FRONTEND_URL || "http://localhost:3000";
      const loginLink = `${frontendUrl}/login?email=${encodeURIComponent(email.toLowerCase())}&code=${code}`;

      await mailer.sendAgentWelcomeLink(email.toLowerCase(), name, loginLink);
    } catch (e) {
      console.warn("Failed to send verification login link email to agent:", e.message);
    }

    return successResponse({
      res,
      statusCode: 201,
      message: "Agent created successfully. Magic login link has been sent to their email.",
      data: {
        agent: {
          ...agentUser.toObject(),
          profile: agentProfile
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getPayoutRequests(req, res, next) {
  try {
    const { PayoutRequest } = await import("../../models/PayoutRequest.js");
    const requests = await PayoutRequest.find()
      .populate("agentId", "name email")
      .populate("processedBy", "name")
      .sort({ createdAt: -1 })
      .lean();

    return successResponse({ res, data: { requests } });
  } catch (error) {
    next(error);
  }
}

export async function processPayoutRequest(req, res, next) {
  try {
    const { id } = req.params;
    const { action, transactionId, notes } = req.body; // action: 'approve' or 'reject'

    if (!["approve", "reject"].includes(action)) {
      return errorResponse({ res, statusCode: 400, message: "Invalid action" });
    }

    const { PayoutRequest } = await import("../../models/PayoutRequest.js");
    const { AgentProfile } = await import("../../models/AgentProfile.js");
    const { AgentTransaction } = await import("../../models/AgentTransaction.js");
    
    const request = await PayoutRequest.findById(id);
    if (!request) {
      return errorResponse({ res, statusCode: 404, message: "Payout request not found" });
    }
    
    if (request.status !== "pending") {
      return errorResponse({ res, statusCode: 400, message: `Request is already ${request.status}` });
    }

    const profile = await AgentProfile.findOne({ userId: request.agentId });
    if (!profile) {
      return errorResponse({ res, statusCode: 404, message: "Agent profile not found" });
    }

    const wallet = profile.wallets.find(w => w.currency === request.currency);
    if (!wallet) {
      return errorResponse({ res, statusCode: 400, message: "Wallet not found" });
    }

    if (action === "approve") {
      if (wallet.pending < request.amount) {
        return errorResponse({ res, statusCode: 400, message: "Agent has insufficient pending balance for this approval." });
      }
      wallet.pending -= request.amount;
      wallet.paid += request.amount;
      request.status = "approved";
      request.transactionId = transactionId;
    } else {
      request.status = "rejected";
    }

    request.notes = notes;
    request.processedAt = new Date();
    request.processedBy = req.user.userId;

    await profile.save();
    await request.save();

    if (action === "approve") {
      await AgentTransaction.create({
        agentId: request.agentId,
        type: "payout",
        amount: request.amount,
        currency: request.currency,
        referenceId: request._id.toString(),
        description: `Payout processed by admin. Transaction ID: ${transactionId || "N/A"}`
      });
    }

    const { AuditLog } = await import("../../models/AuditLog.js");
    await AuditLog.create({
      actorId: req.user.userId,
      module: "admin",
      action: `payout_request_${action}`,
      targetType: "PayoutRequest",
      targetId: request._id,
      message: `${action === "approve" ? "Approved" : "Rejected"} payout of ${request.amount} ${request.currency}`,
      ip: req.ip
    });

    return successResponse({ res, message: `Payout request ${action}d successfully`, data: request });
  } catch (error) {
    next(error);
  }
}

export async function getAgentPerformanceStats(req, res, next) {
  try {
    const { Business } = await import("../../models/Business.js");
    const { AgentTransaction } = await import("../../models/AgentTransaction.js");

    const agents = await User.find({ role: "agent" }).select("name email status").lean();
    const profiles = await AgentProfile.find().lean();
    const clientsCount = await Business.aggregate([
      { $match: { agentId: { $exists: true } } },
      { $group: { _id: "$agentId", count: { $sum: 1 } } }
    ]);

    const transactions = await AgentTransaction.aggregate([
      {
        $group: {
          _id: { agentId: "$agentId", type: "$type", currency: "$currency" },
          total: { $sum: "$amount" }
        }
      }
    ]);

    const stats = agents.map(agent => {
      const profile = profiles.find(p => p.userId.toString() === agent._id.toString());
      const clients = clientsCount.find(c => c._id?.toString() === agent._id.toString())?.count || 0;
      
      const earnings = transactions.filter(t => t._id.agentId?.toString() === agent._id.toString() && t._id.type === "commission");
      const payouts = transactions.filter(t => t._id.agentId?.toString() === agent._id.toString() && t._id.type === "payout");

      return {
        _id: agent._id,
        name: agent.name,
        email: agent.email,
        status: agent.status,
        wallets: profile?.wallets || [],
        clientsCount: clients,
        totalSales: profile?.totalSales || 0,
        earnings,
        payouts
      };
    });

    return successResponse({ res, data: { stats } });
  } catch (error) {
    next(error);
  }
}
