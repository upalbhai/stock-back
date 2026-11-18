import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { BlogPost } from "../models/BlogPost.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BLOG_UPLOAD_DIR = path.join(__dirname, "../../uploads/blog");

/**
 * Extract all blog image filenames from HTML content and coverImage URL.
 * Matches filenames like "blog-1787676826787-t78evc.jpg"
 */
export function extractBlogImageFiles(content = "", coverImage = "") {
  const files = new Set();
  const regex = /\/uploads\/blog\/(blog-[a-z0-9\-]+\.\w+)/gi;

  let match;
  while ((match = regex.exec(content)) !== null) {
    files.add(match[1]);
  }
  while ((match = regex.exec(coverImage)) !== null) {
    files.add(match[1]);
  }

  return files;
}

/**
 * Delete specific image files from the blog uploads directory.
 * Silently ignores files that don't exist.
 */
export async function deleteBlogImages(filenames) {
  for (const filename of filenames) {
    try {
      const filePath = path.join(BLOG_UPLOAD_DIR, filename);
      await fs.unlink(filePath);
      console.log(`[blog-cleanup] Deleted orphan: ${filename}`);
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.error(`[blog-cleanup] Failed to delete ${filename}:`, err.message);
      }
    }
  }
}

/**
 * Compare old content vs new content and delete images that were removed.
 * Call this BEFORE saving the updated post (pass old doc's content).
 */
export async function cleanupRemovedImages(oldContent, oldCoverImage, newContent, newCoverImage) {
  const oldFiles = extractBlogImageFiles(oldContent, oldCoverImage);
  const newFiles = extractBlogImageFiles(newContent, newCoverImage);

  const removedFiles = [...oldFiles].filter(f => !newFiles.has(f));
  if (removedFiles.length > 0) {
    await deleteBlogImages(removedFiles);
  }
  return removedFiles;
}

/**
 * Delete all images referenced in a blog post's content and coverImage.
 * Call this when deleting a blog post.
 */
export async function cleanupAllPostImages(content, coverImage) {
  const files = extractBlogImageFiles(content, coverImage);
  if (files.size > 0) {
    await deleteBlogImages([...files]);
  }
  return [...files];
}

/**
 * Cron-style: Scan all blog posts, collect referenced images,
 * and delete any files in uploads/blog/ that are not referenced.
 */
export async function cleanupOrphanedBlogImages() {
  try {
    // 1. Collect all image filenames referenced in any blog post
    const posts = await BlogPost.find({}, "content coverImage").lean();
    const referencedFiles = new Set();

    for (const post of posts) {
      const files = extractBlogImageFiles(post.content, post.coverImage);
      files.forEach(f => referencedFiles.add(f));
    }

    // 2. List all files on disk
    let diskFiles = [];
    try {
      diskFiles = await fs.readdir(BLOG_UPLOAD_DIR);
    } catch (err) {
      if (err.code === "ENOENT") return []; // directory doesn't exist yet
      throw err;
    }

    // 3. Find orphans (on disk but not referenced)
    const orphans = diskFiles.filter(
      f => f.startsWith("blog-") && !referencedFiles.has(f)
    );

    if (orphans.length > 0) {
      console.log(`[blog-cleanup-cron] Found ${orphans.length} orphaned image(s). Deleting...`);
      await deleteBlogImages(orphans);
    } else {
      console.log("[blog-cleanup-cron] No orphaned images found.");
    }

    return orphans;
  } catch (err) {
    console.error("[blog-cleanup-cron] Error during cleanup:", err.message);
    return [];
  }
}
