function validate(schema, source = "body") {
  return (req, res, next) => {
    const input = req[source];
    const result = schema.safeParse(input);
    if (!result.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: result.error.flatten().fieldErrors
      });
    }
    req[source] = result.data;
    return next();
  };
}
export {
  validate
};
