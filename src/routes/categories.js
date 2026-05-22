import { Router } from "express";
import { listCategories, createCategory, updateCategory, deleteCategory } from "../controllers/categoryController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { categoryCreateSchema, categoryUpdateSchema, idParamSchema } from "../validators/schemas.js";
const categoryRouter = Router();
categoryRouter.get("/", requireAuth, listCategories);
categoryRouter.post("/", requireAuth, requirePermission("categories", "create"), validate(categoryCreateSchema), createCategory);
categoryRouter.patch("/:id", requireAuth, requirePermission("categories", "update"), validate(idParamSchema, "params"), validate(categoryUpdateSchema), updateCategory);
categoryRouter.delete("/:id", requireAuth, requirePermission("categories", "delete"), validate(idParamSchema, "params"), deleteCategory);
export {
  categoryRouter
};
