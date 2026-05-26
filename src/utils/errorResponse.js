export const errorResponse = ({
  res,
  statusCode = 400,
  message = "An error occurred",
  errors = {},
}) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};
