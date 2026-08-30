import { BlogPost } from "../models/BlogPost.js";

// @route   GET /api/blogs
// @desc    Get all published blog posts (paginated)
// @access  Public
export const getPublishedBlogs = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const tag = req.query.tag;

    const query = { status: "published" };
    if (tag) {
      query.tags = tag;
    }

    const posts = await BlogPost.find(query)
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("authorId", "name")
      .lean();

    const total = await BlogPost.countDocuments(query);

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

    res.json({
      success: true,
      data: {
        posts,
        total
      },
      meta: {
        pagination: {
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/blogs/:slug
// @desc    Get a single published blog post by slug
// @access  Public
export const getPublishedBlogBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;

    const post = await BlogPost.findOne({ slug, status: "published" })
      .populate("authorId", "name")
      .lean();

    if (!post) {
      return res.status(404).json({ success: false, message: "Blog post not found" });
    }

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

    res.json({
      success: true,
      data: {
        post
      }
    });
  } catch (error) {
    next(error);
  }
};
