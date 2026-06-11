import { Business } from "../models/Business.js";
import { Product } from "../models/Product.js";
import { Outlet } from "../models/Outlet.js";
import { User } from "../models/User.js";
import { errorResponse } from "./errorResponse.js";

async function getBusinessLimits(businessId) {
  return Business.findById(businessId).select("maxOutlets maxStaff maxProducts name").lean();
}

export async function assertCanAddProduct(req, res) {
  if (req.user?.role === "superadmin") return true;

  const { businessId } = req.user;
  const business = await getBusinessLimits(businessId);
  if (!business) return true;

  const count = await Product.countDocuments({ businessId });
  if (count >= business.maxProducts) {
    errorResponse({
      res,
      statusCode: 403,
      message: `Product limit reached (${business.maxProducts}). Upgrade your plan to add more products.`,
    });
    return false;
  }
  return true;
}

export async function assertCanAddOutlet(req, res) {
  if (req.user?.role === "superadmin") return true;

  const { businessId } = req.user;
  const business = await getBusinessLimits(businessId);
  if (!business) return true;

  const count = await Outlet.countDocuments({ businessId });
  if (count >= business.maxOutlets) {
    errorResponse({
      res,
      statusCode: 403,
      message: `Outlet limit reached (${business.maxOutlets}). Upgrade your plan to add more outlets.`,
    });
    return false;
  }
  return true;
}

export async function assertCanAddStaff(req, res) {
  if (req.user?.role === "superadmin") return true;

  const { businessId } = req.user;
  const business = await getBusinessLimits(businessId);
  if (!business) return true;

  const count = await User.countDocuments({ businessId, role: { $ne: "owner" } });
  if (count >= business.maxStaff) {
    errorResponse({
      res,
      statusCode: 403,
      message: `Staff limit reached (${business.maxStaff}). Upgrade your plan to add more team members.`,
    });
    return false;
  }
  return true;
}
