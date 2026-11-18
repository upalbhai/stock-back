import mongoose, { Schema } from "mongoose";
const emailOtpSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    code: { type: String, required: true },
    type: { type: String, enum: ["login", "invite"], default: "login" },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    used: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);
emailOtpSchema.index({ email: 1, used: 1 });
// TTL index: Automatically delete documents 7 days after creation (7 * 24 * 60 * 60 = 604800 seconds)
emailOtpSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });

const EmailOtp = mongoose.models.EmailOtp || mongoose.model("EmailOtp", emailOtpSchema);
export {
  EmailOtp
};
