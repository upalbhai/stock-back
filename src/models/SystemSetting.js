import mongoose from "mongoose";

const systemSettingSchema = new mongoose.Schema(
  {
    maintenanceMode: { type: Boolean, default: false },
    defaultTrialDays: { type: Number, default: 14 },
    allowNewSignups: { type: Boolean, default: true },
    globalAnnouncement: { type: String, default: "" },
  },
  { timestamps: true }
);

export const SystemSetting = mongoose.model("SystemSetting", systemSettingSchema);
