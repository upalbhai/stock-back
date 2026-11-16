import mongoose from "mongoose";

const systemSettingSchema = new mongoose.Schema(
  {
    maintenanceMode: { type: Boolean, default: false },
    defaultTrialDays: { type: Number, default: 14 },
    allowNewSignups: { type: Boolean, default: true },
    globalAnnouncement: { type: String, default: "" },
    bankDetails: {
      accountName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      ifsc: { type: String, default: "" },
      bankName: { type: String, default: "" },
      branch: { type: String, default: "" },
      upiId: { type: String, default: "" },
      notes: { type: String, default: "" }
    },
    emailConfig: {
      provider: { type: String, enum: ["ZEPTOMAIL", "BREVO"], default: "ZEPTOMAIL" },
      fallbackEnabled: { type: Boolean, default: true },
      fromEmail: { type: String, default: "noreply@minihisab.com" },
      fromName: { type: String, default: "Mini Hisab" },
      zepto: {
        apiKey: { type: String, default: "" },
        region: { type: String, enum: ["IN", "US", "EU"], default: "IN" }
      },
      brevo: {
        apiKey: { type: String, default: "" }
      },
      // Backward compatibility fields
      apiKey: { type: String, default: "" },
      region: { type: String, default: "IN" }
    },
    razorpayConfig: {
      keyId: { type: String, default: "" },
      keySecret: { type: String, default: "" },
      webhookSecret: { type: String, default: "" }
    },
  },
  { timestamps: true }
);

export const SystemSetting = mongoose.model("SystemSetting", systemSettingSchema);
