import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Category } from "../models/Category.js";
import { AuditLog } from "../models/AuditLog.js";
function makeSlug(name, businessId) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  return `${base}-${businessId.slice(-4)}`;
}
async function listCategories(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, flat, page = 1, limit = 50 } = req.query;
    const query = { businessId, isActive: true };
    if (outletId) query.$or = [{ outletId }, { outletId: null }];

    // If flat=true, return a flat list with pagination like products
    if (flat === "true") {
      const numLimit = Number(limit);
      const numPage = Number(page);
      const categories = await Category.find(query).sort({ parentId: 1, sortOrder: 1, name: 1 }).skip((numPage - 1) * numLimit).limit(numLimit).lean();
      const total = await Category.countDocuments(query);
      const meta = {
        pagination: {
          page: numPage,
          limit: numLimit,
          total,
          totalPages: Math.ceil(total / numLimit)
        }
      };
      return successResponse({
        res: res,
        message: "Categories fetched successfully",
        data: categories,
        meta
      });
    }

    // Otherwise return nested tree (no pagination)
    const categories = await Category.find(query).sort({ parentId: 1, sortOrder: 1, name: 1 }).lean();
    const topLevel = categories.filter((c) => !c.parentId);
    const buildTree = (parent) => ({
      ...parent,
      children: categories.filter(
        (c) => c.parentId?.toString() === parent._id.toString()
      )
    });
    return successResponse({
      res: res,
      data: {
        categories: topLevel.map(buildTree)
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function createCategory(req, res, next) {
  try {
    const { businessId } = req.user;
    const { name, parentId, outletId, icon, color, image, sortOrder, description } = req.body;
    const slug = makeSlug(name, businessId);
    const category = await Category.create({
      businessId,
      parentId: parentId || null,
      outletId: outletId || null,
      name,
      slug,
      description,
      icon: icon || "\u{1F37D}\uFE0F",
      color: color || "#6366f1",
      image,
      sortOrder: sortOrder ?? 0
    });
    await AuditLog.create({
      businessId,
      actorId: req.user?.userId,
      module: "categories",
      action: "create",
      targetType: "Category",
      targetId: category._id,
      targetName: category.name,
      message: `Category created: ${category.name}`,
      ip: req.ip
    });
    return successResponse({
      res: res,
      statusCode: 201,

      data: {
        category
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function updateCategory(req, res, next) {
  try {
    const { businessId } = req.user;
    const allowed = ["name", "parentId", "icon", "color", "image", "sortOrder", "isActive", "description"];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== void 0) update[key] = req.body[key];
    }
    if (update.name) {
      update.slug = makeSlug(update.name, businessId);
    }
    const category = await Category.findOneAndUpdate(
      { _id: req.params.id, businessId },
      { $set: update },
      { new: true }
    );
    if (!category) return errorResponse({
      res: res,
      statusCode: 404,
      message: "Category not found"
    });
    return successResponse({
      res: res,

      data: {
        category
      }
    });
  } catch (error) {
    return next(error);
  }
}
async function deleteCategory(req, res, next) {
  try {
    const { businessId } = req.user;
    const category = await Category.findOne({ _id: req.params.id, businessId });
    if (!category) {
      return errorResponse({ res: res, statusCode: 404, message: "Category not found" });
    }

    category.isActive = false;
    category.slug = `${category.slug}-deleted-${Date.now()}`;
    await category.save();

    return successResponse({
      res: res,
      message: "Category deactivated"
    });
  } catch (error) {
    return next(error);
  }
}
export {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory
};
