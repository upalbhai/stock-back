import mongoose, { Schema } from "mongoose";

const rateLimitSchema = new Schema({
  key: { type: String, required: true, index: true },     // e.g. "otp:user@email.com"
  hits: { type: Number, default: 1 },
  windowStart: { type: Date, required: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: false });

// Auto-delete expired entries
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RateLimit = mongoose.models.RateLimit || mongoose.model("RateLimit", rateLimitSchema);

export { RateLimit };
