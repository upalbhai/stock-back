import { Category } from "../models/Category.js";
import { AuditLog } from "../models/AuditLog.js";
function makeSlug(name, businessId) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  return `${base}-${businessId.slice(-4)}`;
}
async function listCategories(req, res, next) {
  try {
    const { businessId } = req.user;
    const { outletId, flat } = req.query;
    const query = { businessId, isActive: true };
    if (outletId) query.$or = [{ outletId }, { outletId: null }];
    const categories = await Category.find(query).sort({ parentId: 1, sortOrder: 1, name: 1 }).lean();
    if (flat === "true") {
      return res.json({ categories });
    }
    const topLevel = categories.filter((c) => !c.parentId);
    const buildTree = (parent) => ({
      ...parent,
      children: categories.filter(
        (c) => c.parentId?.toString() === parent._id.toString()
      )
    });
    return res.json({ categories: topLevel.map(buildTree) });
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
    return res.status(201).json({ category });
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
    if (!category) return res.status(404).json({ message: "Category not found" });
    return res.json({ category });
  } catch (error) {
    return next(error);
  }
}
async function deleteCategory(req, res, next) {
  try {
    const { businessId } = req.user;
    await Category.findOneAndUpdate(
      { _id: req.params.id, businessId },
      { $set: { isActive: false } }
    );
    return res.json({ message: "Category deactivated" });
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
