import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodSchema } from "zod";

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Invalid request",
          issues: error.issues.map((issue) => issue.message)
        });
      }
      return res.status(400).json({ message: "Invalid request" });
    }
  };
}
