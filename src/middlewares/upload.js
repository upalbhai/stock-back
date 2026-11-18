import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.join(__dirname, "../../uploads/blog");

// Ensure directory exists synchronously at startup
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + "-" + Math.random().toString(36).substring(7);
    cb(null, "blog-" + uniqueSuffix + ext);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error("Only .png, .jpg, .jpeg and .webp formats are allowed!");
    err.status = 400;
    cb(err, false);
  }
};

export const blogImageUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

const PAYMENT_UPLOAD_DIR = path.join(__dirname, "../../uploads/payments");

if (!fs.existsSync(PAYMENT_UPLOAD_DIR)) {
  fs.mkdirSync(PAYMENT_UPLOAD_DIR, { recursive: true });
}

const paymentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, PAYMENT_UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + "-" + Math.random().toString(36).substring(7);
    cb(null, "payment-" + uniqueSuffix + ext);
  },
});

export const paymentProofUpload = multer({
  storage: paymentStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});
