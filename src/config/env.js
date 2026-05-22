import dotenv from "dotenv";
import { z } from "zod";
dotenv.config();
const envSchema = z.object({
  PORT: z.coerce.number().default(4e3),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
  CORS_ORIGINS: z.string().optional()
});
const env = envSchema.parse({
  PORT: process.env.PORT,
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  CORS_ORIGINS: process.env.CORS_ORIGINS
});
const corsOrigins = (env.CORS_ORIGINS || env.CORS_ORIGIN)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
export {
  corsOrigins,
  env
};
