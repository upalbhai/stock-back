import mongoose, { Schema } from "mongoose";

const sessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  tokenHash: { type: String, required: true },            // SHA-256 of JWT for revocation check
  deviceName: { type: String, default: "Unknown device" },// e.g. "Chrome 126 on macOS"
  deviceType: { type: String, enum: ["desktop", "mobile", "tablet", "unknown"], default: "unknown" },
  browser: { type: String },
  os: { type: String },
  ip: { type: String },
  location: {
    city: { type: String, default: "Unknown" },
    region: { type: String, default: "" },
    country: { type: String, default: "Unknown" }
  },
  lastActiveAt: { type: Date, default: Date.now },
  isRevoked: { type: Boolean, default: false },
  revokedAt: { type: Date },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

sessionSchema.index({ userId: 1, isRevoked: 1 });
sessionSchema.index({ tokenHash: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL auto-cleanup

const Session = mongoose.models.Session || mongoose.model("Session", sessionSchema);

export { Session };
