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
