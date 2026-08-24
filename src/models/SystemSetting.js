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
  },
  { timestamps: true }
);

export const SystemSetting = mongoose.model("SystemSetting", systemSettingSchema);
