import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const UPLOAD_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../uploads/manual-payments"
);

const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_BYTES = 1.5 * 1024 * 1024;

export function normalizeUtr(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function resolveUtr(payment) {
  if (payment?.utr) return payment.utr;
  const raw = payment?.screenshotUrl || "";
  if (raw.startsWith("TXN:") || raw.startsWith("UTR:")) return raw.slice(4);
  return "";
}

export function hasScreenshotFile(payment) {
  if (payment?.screenshotPath) return true;
  const url = payment?.screenshotUrl || "";
  return Boolean(url) && !url.startsWith("TXN:") && !url.startsWith("UTR:") && !url.startsWith("FILE:");
}

export function addBillingPeriod(fromDate, billingCycle = "monthly") {
  const end = new Date(fromDate);
  if (billingCycle === "yearly") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

export async function saveManualPaymentScreenshot(businessId, dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    const err = new Error("Screenshot must be a JPEG, PNG, or WebP image");
    err.status = 400;
    throw err;
  }
  const mime = match[1].toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    const err = new Error("Screenshot must be a JPEG, PNG, or WebP image");
    err.status = 400;
    throw err;
  }
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) {
    const err = new Error("Screenshot file is empty");
    err.status = 400;
    throw err;
  }
  if (buffer.length > MAX_BYTES) {
    const err = new Error("Screenshot must be under 1.5 MB");
    err.status = 400;
    throw err;
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const filename = `${businessId}-${Date.now()}.${ext}`;
  const absPath = path.join(UPLOAD_DIR, filename);
  await fs.writeFile(absPath, buffer);
  return {
    screenshotPath: filename,
    mimeType: mime === "image/jpg" ? "image/jpeg" : mime
  };
}

export function screenshotAbsolutePath(filename) {
  return path.join(UPLOAD_DIR, path.basename(filename));
}
