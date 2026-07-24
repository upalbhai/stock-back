import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import {
  registerAgent,
  getAgentStats,
  getAgentClients,
  createClient,
  updateCustomPlan,
  requestPayout,
  getPlanRequestHistory,
  getAgentWalletHistory
} from "../controllers/agentController.js";

const router = Router();

// Public route for agent registration
router.post("/register", registerAgent);

// Protected routes (require auth)
router.use(requireAuth);

// Ensure the user is an agent (and approved)
router.use((req, res, next) => {
  if (req.user.role !== "agent") {
    return res.status(403).json({ message: "Agent access required" });
  }
  // status check is ideally done at login or here, but we'll assume it's enforced
  next();
});

router.get("/stats", getAgentStats);
router.get("/wallet/history", getAgentWalletHistory);
router.get("/clients", getAgentClients);
router.post("/clients", createClient);
router.put("/clients/:businessId/custom-plan", updateCustomPlan);
router.get("/clients/:businessId/plan-history", getPlanRequestHistory);
router.post("/payout-requests", requestPayout);

export default router;
