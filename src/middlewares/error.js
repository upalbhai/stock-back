import { logger } from "../utils/logger.js";

function errorHandler(err, _req, res, _next) {
  let status = err.status || 500;
  let message = err.message || "Internal server error";

  if (err.code === 11000) {
    status = 409;
    const keys = Object.keys(err.keyValue || {});
    if (keys.length > 0) {
      const field = keys[0];
      const val = err.keyValue[field];
      message = `A record with ${field} "${val}" already exists.`;
    } else {
      message = "A duplicate record already exists.";
    }
  }

  if (status >= 500) {
    logger.error(message, err);
  }
  res.status(status).json({ message });
}
export {
  errorHandler
};
