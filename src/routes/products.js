import { Router } from "express";
import { listProducts, getProduct, createProduct, updateProduct, deleteProduct } from "../controllers/productController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import { validate } from "../middlewares/validate.js";
import { idParamSchema, productCreateSchema, productUpdateSchema } from "../validators/schemas.js";
const productRouter = Router();
productRouter.get("/", requireAuth, listProducts);
productRouter.get("/:id", requireAuth, validate(idParamSchema, "params"), getProduct);
productRouter.post("/", requireAuth, requirePermission("products", "create"), validate(productCreateSchema), createProduct);
productRouter.patch("/:id", requireAuth, requirePermission("products", "update"), validate(idParamSchema, "params"), validate(productUpdateSchema), updateProduct);
productRouter.delete("/:id", requireAuth, requirePermission("products", "delete"), validate(idParamSchema, "params"), deleteProduct);
export {
  productRouter
};
