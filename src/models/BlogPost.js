import mongoose, { Schema } from "mongoose";

const blogPostSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    excerpt: { type: String, trim: true },
    content: { type: String },
    coverImage: { type: String },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft"
    },
    publishedAt: { type: Date },
    authorId: { type: Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    seoTitle: { type: String, trim: true },
    seoDescription: { type: String, trim: true },
    canonicalUrl: { type: String, trim: true },
    ogImage: { type: String },
    tags: { type: [String], default: [] },
    noindex: { type: Boolean, default: false }
  },
  { timestamps: true }
);

blogPostSchema.index({ slug: 1 }, { unique: true });
blogPostSchema.index({ status: 1, publishedAt: -1 });

const BlogPost = mongoose.models.BlogPost || mongoose.model("BlogPost", blogPostSchema);

export { BlogPost };
