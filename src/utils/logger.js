function logInfo(message, meta) {
  if (meta) {
    console.log(`[INFO] ${message}`, meta);
    return;
  }
  console.log(`[INFO] ${message}`);
}

function logWarn(message, meta) {
  if (meta) {
    console.warn(`[WARN] ${message}`, meta);
    return;
  }
  console.warn(`[WARN] ${message}`);
}

function logError(message, meta) {
  if (meta) {
    console.error(`[ERROR] ${message}`, meta);
    return;
  }
  console.error(`[ERROR] ${message}`);
}

export const logger = {
  info: logInfo,
  warn: logWarn,
  error: logError
};
