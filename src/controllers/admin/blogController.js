import { successResponse } from "../../utils/successResponse.js";
import { errorResponse } from "../../utils/errorResponse.js";
import { BlogPost } from "../../models/BlogPost.js";
import { AuditLog } from "../../models/AuditLog.js";
import { cleanupRemovedImages, cleanupAllPostImages } from "../../utils/blogImageCleanup.js";
import { sanitizeBlogContent } from "../../utils/sanitizeBlogContent.js";

const calculateReadingTime = (text) => {
  if (!text) return 0;
  const wordsPerMinute = 200;
  const words = text.replace(/(<([^>]+)>)/gi, "").trim().split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
};
// @route   GET /api/admin/blogs
// @desc    Get all blogs for admin CMS
export const getAdminBlogs = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.search) {
      query.title = { $regex: req.query.search, $options: "i" };
    }

    const posts = await BlogPost.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("authorId", "name email")
      .populate("createdBy", "name email")
      .lean();

    const total = await BlogPost.countDocuments(query);

    return successResponse({
      res,
      data: {
        posts,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/admin/blogs
// @desc    Create a new blog post (always creates as draft; use /publish to go live)
export const createBlog = async (req, res, next) => {
  try {
    const data = req.body;

    // Gap #1: Never accept status on create — only /publish endpoint changes status
    delete data.status;

    // Gap #3: Sanitize HTML content to prevent XSS
    if (data.content) {
      data.content = sanitizeBlogContent(data.content);
      data.readingTime = calculateReadingTime(data.content);
    }

    // Check if slug exists
    if (data.slug) {
      const existing = await BlogPost.findOne({ slug: data.slug });
      if (existing) {
        return errorResponse({ res, statusCode: 409, message: "Slug already exists" });
      }
    }

    const post = await BlogPost.create({
      ...data,
      status: "draft",
      createdBy: req.user?.userId,
      authorId: data.authorId || req.user?.userId
    });

    await AuditLog.create({
      actorId: req.user?.userId,
      module: "blogs",
      action: "create",
      message: `Created blog post: ${post.title}`,
      ip: req.ip
    });

    return successResponse({ res, statusCode: 201, data: { post } });
  } catch (error) {
    next(error);
  }
};

// @route   PATCH /api/admin/blogs/:id
// @desc    Update a blog post (status field ignored; use /publish or /unpublish)
export const updateBlog = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;

    // Gap #1: Strip status — only dedicated endpoints can change status
    delete data.status;

    // Gap #3: Sanitize HTML content to prevent XSS
    if (data.content) {
      data.content = sanitizeBlogContent(data.content);
      data.readingTime = calculateReadingTime(data.content);
    }

    if (data.slug) {
      const existing = await BlogPost.findOne({ slug: data.slug, _id: { $ne: id } });
      if (existing) {
        return errorResponse({ res, statusCode: 409, message: "Slug already exists" });
      }
    }

    // Fetch old post BEFORE updating to compare images
    const oldPost = await BlogPost.findById(id).lean();
    if (!oldPost) {
      return errorResponse({ res, statusCode: 404, message: "Blog post not found" });
    }

    const post = await BlogPost.findByIdAndUpdate(
      id,
      { ...data, updatedBy: req.user?.userId },
      { new: true, runValidators: true }
    );

    // Cleanup images that were in the old content but removed in the update
    cleanupRemovedImages(
      oldPost.content, oldPost.coverImage,
      data.content ?? oldPost.content, data.coverImage ?? oldPost.coverImage
    ).catch(err => console.error("[blog-cleanup] update cleanup failed:", err.message));

    await AuditLog.create({
      actorId: req.user?.userId,
      module: "blogs",
      action: "update",
      message: `Updated blog post: ${post.title}`,
      ip: req.ip
    });

    return successResponse({ res, data: { post } });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/admin/blogs/:id/publish
// @desc    Publish a blog post
export const publishBlog = async (req, res, next) => {
  try {
    const { id } = req.params;

    const post = await BlogPost.findByIdAndUpdate(
      id,
      { 
        status: "published", 
        publishedAt: new Date(),
        updatedBy: req.user?.userId
      },
      { new: true }
    );

    if (!post) {
      return errorResponse({ res, statusCode: 404, message: "Blog post not found" });
    }

    await AuditLog.create({
      actorId: req.user?.userId,
      module: "blogs",
      action: "publish",
      message: `Published blog post: ${post.title}`,
      ip: req.ip
    });

    return successResponse({ res, data: { post } });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/admin/blogs/:id/unpublish
// @desc    Unpublish a blog post
export const unpublishBlog = async (req, res, next) => {
  try {
    const { id } = req.params;

    const post = await BlogPost.findByIdAndUpdate(
      id,
      { 
        status: "draft",
        updatedBy: req.user?.userId
      },
      { new: true }
    );

    if (!post) {
      return errorResponse({ res, statusCode: 404, message: "Blog post not found" });
    }

    await AuditLog.create({
      actorId: req.user?.userId,
      module: "blogs",
      action: "unpublish",
      message: `Unpublished blog post: ${post.title}`,
      ip: req.ip
    });

    return successResponse({ res, data: { post } });
  } catch (error) {
    next(error);
  }
};

// @route   DELETE /api/admin/blogs/:id
// @desc    Delete a blog post
export const deleteBlog = async (req, res, next) => {
  try {
    const { id } = req.params;

    const post = await BlogPost.findByIdAndDelete(id);

    if (!post) {
      return errorResponse({ res, statusCode: 404, message: "Blog post not found" });
    }

    // Cleanup all images associated with this deleted post
    cleanupAllPostImages(post.content, post.coverImage)
      .catch(err => console.error("[blog-cleanup] delete cleanup failed:", err.message));

    await AuditLog.create({
      actorId: req.user?.userId,
      module: "blogs",
      action: "delete",
      message: `Deleted blog post: ${post.title}`,
      ip: req.ip
    });

    return successResponse({ res, data: { message: "Blog post deleted successfully" } });
  } catch (error) {
    next(error);
  }
};

export const uploadBlogImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return errorResponse({ res, statusCode: 400, message: "No image provided" });
    }
    const url = `/uploads/blog/${req.file.filename}`;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return successResponse({ res, statusCode: 201, data: { url: baseUrl + url } });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/admin/blogs/:id
// @desc    Get a single blog post by ID (Gap #6 — replaces inefficient limit:1000 fetch)
export const getAdminBlogById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const post = await BlogPost.findById(id)
      .populate("authorId", "name email")
      .populate("createdBy", "name email")
      .lean();
    if (!post) {
      return errorResponse({ res, statusCode: 404, message: "Blog post not found" });
    }
    return successResponse({ res, data: { post } });
  } catch (error) {
    next(error);
  }
};
