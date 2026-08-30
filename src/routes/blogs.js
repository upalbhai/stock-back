import express from "express";
import { getPublishedBlogs, getPublishedBlogBySlug } from "../controllers/blogController.js";

const router = express.Router();

router.get("/", getPublishedBlogs);
router.get("/:slug", getPublishedBlogBySlug);

export default router;
