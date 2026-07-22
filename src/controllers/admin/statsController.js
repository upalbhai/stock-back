import { successResponse } from "../../utils/successResponse.js";
import { Business } from "../../models/Business.js";
import { User } from "../../models/User.js";
import { Subscription } from "../../models/Subscription.js";

async function adminPlatformStats(req, res, next) {
  try {
    const [
      totalBusinesses,
      activeBusinesses,
      totalUsers,
      activeSubscriptions,
      mrrAggregation,
      recentBusinesses
    ] = await Promise.all([
      Business.countDocuments(),
      Business.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: true }),
      Subscription.countDocuments({ status: "active" }),
      Subscription.aggregate([
        { $match: { status: "active" } },
        {
          $group: {
            _id: null,
            mrr: {
              $sum: {
                $cond: [
                  { $eq: ["$billingCycle", "yearly"] },
                  { $divide: ["$amount", 12] },
                  "$amount"
                ]
              }
            }
          }
        }
      ]),
      Business.find().sort({ createdAt: -1 }).limit(5).select("name email createdAt status")
    ]);

    const mrr = mrrAggregation.length > 0 ? Math.round(mrrAggregation[0].mrr) : 0;

    return successResponse({
      res: res,
      data: {
        totalBusinesses,
        activeBusinesses,
        totalUsers,
        activeSubscriptions,
        mrr,
        recentBusinesses
      }
    });
  } catch (error) {
    return next(error);
  }
}

export {
  adminPlatformStats
};
