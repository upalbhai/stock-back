import { Router } from "express";
import { listCategories, createCategory, updateCategory, deleteCategory } from "../controllers/categoryController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
const categoryRouter = Router();
categoryRouter.get("/", requireAuth, listCategories);
categoryRouter.post("/", requireAuth, requirePermission("categories", "create"), createCategory);
categoryRouter.patch("/:id", requireAuth, requirePermission("categories", "update"), updateCategory);
categoryRouter.delete("/:id", requireAuth, requirePermission("categories", "delete"), deleteCategory);
export {
  categoryRouter
};
