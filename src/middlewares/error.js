import { logger } from "../utils/logger.js";

function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const message = err.message || "Internal server error";
  if (status >= 500) {
    logger.error(message, err);
  }
  res.status(status).json({ message });
}
export {
  errorHandler
};
