import { successResponse } from "../../utils/successResponse.js";
import { Business } from "../../models/Business.js";
import { User } from "../../models/User.js";

async function adminPlatformStats(req, res, next) {
  try {
    const [totalBusinesses, activeBusinesses, totalUsers] = await Promise.all([
      Business.countDocuments(),
      Business.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: true })
    ]);
    return successResponse({
      res: res,
      data: {
        totalBusinesses,
        activeBusinesses,
        totalUsers
      }
    });
  } catch (error) {
    return next(error);
  }
}

export {
  adminPlatformStats
};
