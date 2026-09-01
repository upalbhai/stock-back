import mongoose from "mongoose";
import dns from "dns";
import { env } from "./env.js";

// Configure DNS servers to bypass Windows/ISP local DNS SRV query restriction
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  // Fallback to system default if custom DNS set fails
}

async function connectDatabase() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGODB_URI);
  console.log("MongoDB connected");
}

export {
  connectDatabase
};
