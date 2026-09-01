import mongoose from "mongoose";
import { User } from "../../models/User.js";
import { Business } from "../../models/Business.js";
import { Outlet } from "../../models/Outlet.js";
import { Role } from "../../models/Role.js";
import { Unit } from "../../models/Unit.js";
import { Category } from "../../models/Category.js";
import { Brand } from "../../models/Brand.js";
import { Product } from "../../models/Product.js";
import { Inventory } from "../../models/Inventory.js";
import { StockEntry } from "../../models/StockEntry.js";
import { StockTransfer } from "../../models/StockTransfer.js";
import { Order } from "../../models/Order.js";
import { Customer } from "../../models/Customer.js";
import { CustomerTransaction } from "../../models/CustomerTransaction.js";
import { Expense } from "../../models/Expense.js";
import { Invite } from "../../models/Invite.js";
import { Subscription } from "../../models/Subscription.js";
import { ManualPayment } from "../../models/ManualPayment.js";
import { Payment } from "../../models/Payment.js";
import { Session } from "../../models/Session.js";
import { EmailOtp } from "../../models/EmailOtp.js";
import { Notification } from "../../models/Notification.js";
import { AuditLog } from "../../models/AuditLog.js";
import { AgentProfile } from "../../models/AgentProfile.js";
import { AgentTransaction } from "../../models/AgentTransaction.js";
import { PayoutRequest } from "../../models/PayoutRequest.js";
import { RefreshToken } from "../../models/RefreshToken.js";
import { successResponse } from "../../utils/successResponse.js";
import { errorResponse } from "../../utils/errorResponse.js";
import { logger } from "../../utils/logger.js";

/**
 * Permanently purge a user and ALL related data across every collection.
 * Restricted to Superadmin only. Intended for testing and cleanups.
 */
export async function adminPurgeUserData(req, res, next) {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return errorResponse({
        res,
        statusCode: 400,
        message: "Invalid User ID format"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse({
        res,
        statusCode: 404,
        message: "User not found"
      });
    }

    // Safety guard: prevent purging superadmin users
    if (user.role === "superadmin") {
      return errorResponse({
        res,
        statusCode: 403,
        message: "Safety guard: Cannot purge a Superadmin user account."
      });
    }

    // Safety guard: cannot purge yourself
    if (req.user?.userId === userId) {
      return errorResponse({
        res,
        statusCode: 403,
        message: "Safety guard: You cannot purge your own logged-in account."
      });
    }

    // 1. Identify all businesses owned by or associated with this user
    const ownedBusinesses = await Business.find({
      $or: [{ ownerId: user._id }, { _id: user.businessId }]
    }).select("_id code name");

    const businessIds = ownedBusinesses.map((b) => b._id);
    if (user.businessId && !businessIds.some((id) => id.toString() === user.businessId.toString())) {
      businessIds.push(user.businessId);
    }

    // 2. Identify all outlets belonging to these businesses or assigned to this user
    const outlets = await Outlet.find({
      $or: [{ businessId: { $in: businessIds } }, { _id: { $in: user.outletIds || [] } }]
    }).select("_id");
    const outletIds = outlets.map((o) => o._id);

    // 3. Identify all secondary users/staff belonging to these businesses
    const relatedUsers = await User.find({
      $or: [{ _id: user._id }, { businessId: { $in: businessIds } }]
    }).select("_id email");
    const allUserIds = relatedUsers.map((u) => u._id);
    const allEmails = relatedUsers.map((u) => u.email?.toLowerCase()).filter(Boolean);

    logger.warn(`Admin purge initiated for user: ${user.name} (${user.email}, ID: ${userId}). Purging ${businessIds.length} businesses and ${allUserIds.length} users.`);

    // 4. Cascade delete across all collections
    const [
      usersDel,
      businessesDel,
      outletsDel,
      rolesDel,
      unitsDel,
      categoriesDel,
      brandsDel,
      productsDel,
      inventoryDel,
      stockEntriesDel,
      stockTransfersDel,
      ordersDel,
      customersDel,
      customerTransactionsDel,
      expensesDel,
      invitesDel,
      subscriptionsDel,
      manualPaymentsDel,
      paymentsDel,
      sessionsDel,
      emailOtpsDel,
      notificationsDel,
      auditLogsDel,
      agentProfilesDel,
      agentTransactionsDel,
      payoutRequestsDel,
      refreshTokensDel
    ] = await Promise.all([
      User.deleteMany({ _id: { $in: allUserIds } }),
      Business.deleteMany({ _id: { $in: businessIds } }),
      Outlet.deleteMany({ _id: { $in: outletIds } }),
      Role.deleteMany({ businessId: { $in: businessIds } }),
      Unit.deleteMany({ businessId: { $in: businessIds } }),
      Category.deleteMany({ businessId: { $in: businessIds } }),
      Brand.deleteMany({ businessId: { $in: businessIds } }),
      Product.deleteMany({ $or: [{ businessId: { $in: businessIds } }, { outletId: { $in: outletIds } }] }),
      Inventory.deleteMany({ $or: [{ businessId: { $in: businessIds } }, { outletId: { $in: outletIds } }] }),
      StockEntry.deleteMany({ $or: [{ businessId: { $in: businessIds } }, { outletId: { $in: outletIds } }] }),
      StockTransfer.deleteMany({ businessId: { $in: businessIds } }),
      Order.deleteMany({ $or: [{ businessId: { $in: businessIds } }, { outletId: { $in: outletIds } }] }),
      Customer.deleteMany({ businessId: { $in: businessIds } }),
      CustomerTransaction.deleteMany({ businessId: { $in: businessIds } }),
      Expense.deleteMany({ $or: [{ businessId: { $in: businessIds } }, { outletId: { $in: outletIds } }] }),
      Invite.deleteMany({ $or: [{ businessId: { $in: businessIds } }, { email: { $in: allEmails } }] }),
      Subscription.deleteMany({ businessId: { $in: businessIds } }),
      ManualPayment.deleteMany({ businessId: { $in: businessIds } }),
      Payment.deleteMany({ businessId: { $in: businessIds } }),
      Session.deleteMany({ userId: { $in: allUserIds } }),
      EmailOtp.deleteMany({ email: { $in: allEmails } }),
      Notification.deleteMany({ $or: [{ recipientId: { $in: allUserIds } }, { businessId: { $in: businessIds } }] }),
      AuditLog.deleteMany({ $or: [{ businessId: { $in: businessIds } }, { actorId: { $in: allUserIds } }] }),
      AgentProfile.deleteMany({ userId: { $in: allUserIds } }),
      AgentTransaction.deleteMany({ $or: [{ agentId: { $in: allUserIds } }, { businessId: { $in: businessIds } }] }),
      PayoutRequest.deleteMany({ agentId: { $in: allUserIds } }),
      RefreshToken.deleteMany({ userId: { $in: allUserIds } })
    ]);

    const deletedCounts = {
      users: usersDel.deletedCount,
      businesses: businessesDel.deletedCount,
      outlets: outletsDel.deletedCount,
      roles: rolesDel.deletedCount,
      units: unitsDel.deletedCount,
      categories: categoriesDel.deletedCount,
      brands: brandsDel.deletedCount,
      products: productsDel.deletedCount,
      inventory: inventoryDel.deletedCount,
      stockEntries: stockEntriesDel.deletedCount,
      stockTransfers: stockTransfersDel.deletedCount,
      orders: ordersDel.deletedCount,
      customers: customersDel.deletedCount,
      customerTransactions: customerTransactionsDel.deletedCount,
      expenses: expensesDel.deletedCount,
      invites: invitesDel.deletedCount,
      subscriptions: subscriptionsDel.deletedCount,
      manualPayments: manualPaymentsDel.deletedCount,
      payments: paymentsDel.deletedCount,
      sessions: sessionsDel.deletedCount,
      emailOtps: emailOtpsDel.deletedCount,
      notifications: notificationsDel.deletedCount,
      auditLogs: auditLogsDel.deletedCount,
      agentProfiles: agentProfilesDel.deletedCount,
      agentTransactions: agentTransactionsDel.deletedCount,
      payoutRequests: payoutRequestsDel.deletedCount,
      refreshTokens: refreshTokensDel.deletedCount
    };

    const totalDeleted = Object.values(deletedCounts).reduce((a, b) => a + b, 0);

    return successResponse({
      res,
      message: `User and all associated test data successfully purged (${totalDeleted} documents removed).`,
      data: {
        purgedUser: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        totalDocumentsDeleted: totalDeleted,
        deletedCounts
      }
    });
  } catch (error) {
    return next(error);
  }
}
