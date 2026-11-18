import express from "express";
import { requireAuth } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permission.js";
import {
  listBrands,
  getBrand,
  createBrand,
  updateBrand,
  deleteBrand
} from "../controllers/brandController.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", listBrands);
router.get("/:id", getBrand);

router.post("/", requirePermission("products", ["create"]), createBrand);
router.put("/:id", requirePermission("products", ["update"]), updateBrand);
router.delete("/:id", requirePermission("products", ["delete"]), deleteBrand);

export { router as brandRouter };
