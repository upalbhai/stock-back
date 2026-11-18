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
          $lookup: {
            from: "businesses",
            localField: "businessId",
            foreignField: "_id",
            as: "business"
          }
        },
        { $unwind: { path: "$business", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "agentprofiles",
            localField: "business.agentId",
            foreignField: "userId",
            as: "agentProfile"
          }
        },
        { $unwind: { path: "$agentProfile", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: "$currency",
            mrr: {
              $sum: {
                $let: {
                  vars: {
                    baseMrr: {
                      $cond: [
                        { $eq: ["$billingCycle", "yearly"] },
                        { $divide: ["$amount", 12] },
                        "$amount"
                      ]
                    },
                    commissionPct: { $ifNull: ["$agentProfile.commissionPercentage", 0] }
                  },
                  in: {
                    $subtract: [
                      "$$baseMrr",
                      { $divide: [{ $multiply: ["$$baseMrr", "$$commissionPct"] }, 100] }
                    ]
                  }
                }
              }
            },
            grossMrr: {
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

    const mrrByCurrencyMap = mrrAggregation.reduce((acc, item) => {
      acc[item._id || "INR"] = {
        net: Math.round(item.mrr),
        gross: Math.round(item.grossMrr)
      };
      return acc;
    }, {});

    const standardCurrencies = ["INR", "USD", "EUR", "GBP", "AED", "SAR"];
    const mrrByCurrency = [];

    for (const cur of standardCurrencies) {
      mrrByCurrency.push({ 
        currency: cur, 
        mrr: mrrByCurrencyMap[cur]?.net || 0,
        grossMrr: mrrByCurrencyMap[cur]?.gross || 0 
      });
      delete mrrByCurrencyMap[cur];
    }

    for (const cur in mrrByCurrencyMap) {
      mrrByCurrency.push({ 
        currency: cur, 
        mrr: mrrByCurrencyMap[cur].net,
        grossMrr: mrrByCurrencyMap[cur].gross
      });
    }

    return successResponse({
      res: res,
      data: {
        totalBusinesses,
        activeBusinesses,
        totalUsers,
        activeSubscriptions,
        mrrByCurrency,
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
