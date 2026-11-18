import mongoose, { Schema } from "mongoose";
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    createdByIp: { type: String },
    userAgent: { type: String }
  },
  { timestamps: true }
);
const RefreshToken = mongoose.models.RefreshToken || mongoose.model("RefreshToken", refreshTokenSchema);
export {
  RefreshToken
};
