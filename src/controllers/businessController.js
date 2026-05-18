import { Business } from "../models/Business.js";
import { Outlet } from "../models/Outlet.js";
async function getMyBusiness(req, res, next) {
  try {
    const business = await Business.findOne({ ownerId: req.user?.userId }).lean();
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }
    const outletCount = await Outlet.countDocuments({ businessId: business._id, isActive: true });
    return res.json({ business: { ...business, outletCount } });
  } catch (error) {
    return next(error);
  }
}
async function updateMyBusiness(req, res, next) {
  try {
    const allowed = [
      "name",
      "address",
      "phone",
      "email",
      "gstNumber",
      "logo",
      "settings",
      "timezone",
      "currency"
    ];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== void 0) update[key] = req.body[key];
    }
    const business = await Business.findOneAndUpdate(
      { ownerId: req.user?.userId },
      { $set: update },
      { new: true }
    );
    return res.json({ business });
  } catch (error) {
    return next(error);
  }
}
export {
  getMyBusiness,
  updateMyBusiness
};
