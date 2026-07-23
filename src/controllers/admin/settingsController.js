import { successResponse } from "../../utils/successResponse.js";
import { errorResponse } from "../../utils/errorResponse.js";
import { SystemSetting } from "../../models/SystemSetting.js";
import { AuditLog } from "../../models/AuditLog.js";
import { clearMaintenanceCache } from "../../middlewares/auth.js";

async function getSettings(req, res, next) {
  try {
    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = await SystemSetting.create({});
    }
    return successResponse({ res, data: { settings } });
  } catch (error) {
    return next(error);
  }
}

async function updateSettings(req, res, next) {
  try {
    const { maintenanceMode, defaultTrialDays, allowNewSignups, globalAnnouncement } = req.body;
    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = new SystemSetting();
    }
    
    if (maintenanceMode !== undefined) settings.maintenanceMode = maintenanceMode;
    if (defaultTrialDays !== undefined) settings.defaultTrialDays = defaultTrialDays;
    if (allowNewSignups !== undefined) settings.allowNewSignups = allowNewSignups;
    if (globalAnnouncement !== undefined) settings.globalAnnouncement = globalAnnouncement;
    
    await settings.save();
    clearMaintenanceCache();

    await AuditLog.create({
      actorId: req.user?.userId,
      module: "admin",
      action: "update_system_settings",
      message: `System settings updated`,
      ip: req.ip
    });

    return successResponse({ res, data: { settings }, message: "Settings updated successfully" });
  } catch (error) {
    return next(error);
  }
}

export { getSettings, updateSettings };
