// Centralized, validated configuration. Everything is env-driven so the app
// is fully self-hostable per the spec.
import { z } from "zod";
import dotenv from "dotenv";
import { resolve } from "node:path";

// Load the repo-root .env (server runs from server/), then any local override.
dotenv.config({ path: resolve(process.cwd(), "../.env") });
dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  SERVER_PORT: z.coerce.number().default(4000),
  CLIENT_URL: z.string().default("http://localhost:5173"),
  PUBLIC_URL: z.string().default("http://localhost:4000"),

  JWT_ACCESS_SECRET: z.string().min(8).default("dev_access_secret_change_me"),
  JWT_REFRESH_SECRET: z.string().min(8).default("dev_refresh_secret_change_me"),
  ACCESS_TOKEN_TTL: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().default(2_592_000),

  // Local SQLite by default — no external database service required.
  DATABASE_URL: z.string().default("file:./dev.db"),

  // Storage: local filesystem by default; point at S3/MinIO for production.
  STORAGE_DIR: z.string().default("./uploads"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().default("concord-media"),

  // The "no limits" knobs. 0 = unlimited.
  MAX_MESSAGE_LENGTH: z.coerce.number().default(100_000),
  MAX_UPLOAD_BYTES: z.coerce.number().default(0),

  // WebRTC ICE. STUN is comma-separated. For reliable cross-network voice,
  // run coturn and set TURN_URLS/TURN_USERNAME/TURN_PASSWORD; otherwise a free
  // public TURN fallback is served to clients.
  STUN_URLS: z.string().default("stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"),
  TURN_URLS: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_PASSWORD: z.string().optional(),

  // GIF search proxy. KLIPY (api.klipy.com) is the default provider — a drop-in
  // Tenor replacement with a free lifetime key from partner.klipy.com. TENOR_KEY
  // is an optional fallback (Tenor v2, needs a Google Cloud key). With neither
  // set the GIF picker simply returns no results. See routes/gifs.ts.
  KLIPY_KEY: z.string().default(""),
  TENOR_KEY: z.string().default(""),

  // Outgoing email (password reset). Without SMTP_HOST the reset code is just
  // logged server-side (dev / no-mail fallback).
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default(""),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("✖ Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === "production";
