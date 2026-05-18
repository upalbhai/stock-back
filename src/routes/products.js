import { Router } from "express";
import { listProducts, getProduct, createProduct, updateProduct, deleteProduct } from "../controllers/productController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
const productRouter = Router();
productRouter.get("/", requireAuth, listProducts);
productRouter.get("/:id", requireAuth, getProduct);
productRouter.post("/", requireAuth, requirePermission("products", "create"), createProduct);
productRouter.patch("/:id", requireAuth, requirePermission("products", "update"), updateProduct);
productRouter.delete("/:id", requireAuth, requirePermission("products", "delete"), deleteProduct);
export {
  productRouter
};
