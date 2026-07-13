import dotenv from "dotenv";
import { z } from "zod";
dotenv.config();
const envSchema = z.object({
  PORT: z.coerce.number().default(4e3),
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(1),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
  CORS_ORIGINS: z.string().optional(),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  BREVO_API_KEY: z.string().optional(),
  BREVO_FROM_EMAIL: z.string().default("no-reply@outletpulse.com"),
  BREVO_FROM_NAME: z.string().default("Outlet Pulse"),
  EMAIL_USER: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional()
});
const env = envSchema.parse({
  PORT: process.env.PORT,
  MONGODB_URI: process.env.MONGODB_URI,
  REDIS_URL: process.env.REDIS_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  CORS_ORIGINS: process.env.CORS_ORIGINS,
  FRONTEND_URL: process.env.FRONTEND_URL,
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  BREVO_FROM_EMAIL: process.env.EMAIL_USER || process.env.BREVO_FROM_EMAIL,
  BREVO_FROM_NAME: process.env.BREVO_FROM_NAME,
  EMAIL_USER: process.env.EMAIL_USER,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET
});
const corsOrigins = (env.CORS_ORIGINS || env.CORS_ORIGIN)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
export {
  corsOrigins,
  env
};
