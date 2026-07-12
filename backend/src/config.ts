import "dotenv/config";
import { z } from "zod";

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(8788),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().min(500).default(1500),
  WORKER_CONCURRENCY: z.coerce.number().min(1).max(6).default(3),
  WORKER_SIGNING_SECRET: z.string().min(24),
  CONVEX_URL: z.string().url(),
  CONVEX_SITE_URL: z.string().url(),
  HERMES_BIN: z.string().default("hermes"),
  HERMES_MODEL: z.string().optional(),
  LINKUP_API_KEY: z.string().min(20),
  TEMPLATE_LIBRARY_PATH: z.string().min(1),
});

export const config = ConfigSchema.parse(process.env);
