import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { authRateLimitStorage } from "@/lib/auth-rate-limit-storage";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema/auth";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schemaName: "auth",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  advanced: {
    ipAddress: {
      // Vercel overwrites this header with the real client IP, so it can't be spoofed there
      ipAddressHeaders: ["x-forwarded-for"],
    },
  },
  rateLimit: {
    // Defaults to production only, so this never runs under npm run dev
    window: 60,
    max: 100,
    customStorage: authRateLimitStorage,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 3600, max: 10 },
      "/change-password": { window: 60, max: 5 },
    },
  },
});
