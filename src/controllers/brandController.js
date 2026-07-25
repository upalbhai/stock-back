import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";
import { Brand } from "../models/Brand.js";
import { AuditLog } from "../models/AuditLog.js";

async function listBrands(req, res, next) {
  try {
    const { businessId } = req.user;
    const { search, includeInactive, page = 1, limit = 50 } = req.query;

    const numLimit = Number(limit);
    const skip = (Number(page) - 1) * numLimit;

    const query = { businessId };
    
    if (!includeInactive) {
      query.isActive = true;
    }

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const [total, brands] = await Promise.all([
      Brand.countDocuments(query),
      Brand.find(query).sort({ name: 1 }).skip(skip).limit(numLimit).lean()
    ]);

    return successResponse({
      res,
      message: "Brands fetched successfully",
      data: brands,
      meta: {
        pagination: {
          page: Number(page),
          limit: numLimit,
          total,
          totalPages: Math.ceil(total / numLimit)
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function getBrand(req, res, next) {
  try {
    const { businessId } = req.user;
    const brand = await Brand.findOne({ _id: req.params.id, businessId }).lean();
    if (!brand) return errorResponse({ res, statusCode: 404, message: "Brand not found" });
    
    return successResponse({
      res,
      data: { brand }
    });
  } catch (error) {
    return next(error);
  }
}

async function createBrand(req, res, next) {
  try {
    const { businessId } = req.user;
    const { name, logo, isActive } = req.body;

    if (!name) return errorResponse({ res, statusCode: 400, message: "Name is required" });

    // Generate unique slug
    let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    let slugExists = await Brand.exists({ businessId, slug });
    if (slugExists) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const brand = await Brand.create({
      businessId,
      name,
      slug,
      logo,
      isActive: isActive !== undefined ? isActive : true
    });

    await AuditLog.create({
      businessId,
      actorId: req.user?.userId,
      module: "brands",
      action: "create",
      targetType: "Brand",
      targetId: brand._id,
      targetName: brand.name,
      message: `Brand created: ${brand.name}`,
      ip: req.ip
    });

    return successResponse({ res, statusCode: 201, data: { brand } });
  } catch (error) {
    return next(error);
  }
}

async function updateBrand(req, res, next) {
  try {
    const { businessId } = req.user;
    const { name, logo, isActive } = req.body;

    const brand = await Brand.findOne({ _id: req.params.id, businessId });
    if (!brand) return errorResponse({ res, statusCode: 404, message: "Brand not found" });

    if (name && name !== brand.name) {
      brand.name = name;
      let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      let slugExists = await Brand.exists({ businessId, slug, _id: { $ne: brand._id } });
      if (slugExists) {
        slug = `${slug}-${Date.now().toString().slice(-4)}`;
      }
      brand.slug = slug;
    }
    
    if (logo !== undefined) brand.logo = logo;
    if (isActive !== undefined) brand.isActive = isActive;

    await brand.save();

    await AuditLog.create({
      businessId,
      actorId: req.user?.userId,
      module: "brands",
      action: "update",
      targetType: "Brand",
      targetId: brand._id,
      targetName: brand.name,
      message: `Brand updated: ${brand.name}`,
      ip: req.ip
    });

    return successResponse({ res, data: { brand } });
  } catch (error) {
    return next(error);
  }
}

async function deleteBrand(req, res, next) {
  try {
    const { businessId } = req.user;
    const brand = await Brand.findOne({ _id: req.params.id, businessId });
    if (!brand) return errorResponse({ res, statusCode: 404, message: "Brand not found" });

    brand.isActive = false;
    await brand.save();

    await AuditLog.create({
      businessId,
      actorId: req.user?.userId,
      module: "brands",
      action: "delete",
      targetType: "Brand",
      targetId: brand._id,
      targetName: brand.name,
      message: `Brand deactivated: ${brand.name}`,
      ip: req.ip
    });

    return successResponse({ res, message: "Brand deactivated successfully" });
  } catch (error) {
    return next(error);
  }
}

export {
  listBrands,
  getBrand,
  createBrand,
  updateBrand,
  deleteBrand
};
