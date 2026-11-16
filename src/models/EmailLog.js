import mongoose from "mongoose";

const emailLogSchema = new mongoose.Schema(
  {
    recipient: { type: String, required: true, index: true },
    subject: { type: String, required: true },
    template: { type: String, default: null },
    provider: { type: String, default: "ZEPTOMAIL" },
    status: {
      type: String,
      enum: ["SENT", "FAILED", "DEV_LOGGED"],
      required: true,
      index: true
    },
    providerMessageId: { type: String, default: null },
    error: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

export const EmailLog = mongoose.models.EmailLog || mongoose.model("EmailLog", emailLogSchema);
