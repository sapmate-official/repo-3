import { config } from 'dotenv';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Locate .env in cwd or project root
const envPath = fs.existsSync(path.resolve(process.cwd(), '.env'))
  ? path.resolve(process.cwd(), '.env')
  : path.resolve(__dirname, '../../.env');

config({ path: envPath });

const weakSecrets = new Set([
  'changeme',
  'change-me',
  'secret',
  'password',
  'your_access_token_secret',
  'your_refresh_token_secret',
  'your_super_admin_secret_key'
]);

const strongSecret = (label: string) =>
  z
    .string()
    .min(32, `${label} must be at least 32 characters`)
    .refine((value) => new Set(value).size >= 8, `${label} must contain at least 8 distinct characters`)
    .refine((value) => !weakSecrets.has(value.toLowerCase()), `${label} must not be a known default value`);

const bodyLimit = (label: string) =>
  z
    .string()
    .regex(/^\d+(?:kb|mb)$/i, `${label} must look like "512kb" or "1mb"`)
    .default('1mb');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(5001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  USER_ACCESS_TOKEN_SECRET: strongSecret('USER_ACCESS_TOKEN_SECRET'),
  USER_REFRESH_TOKEN_SECRET: strongSecret('USER_REFRESH_TOKEN_SECRET'),
  SUPER_ADMIN_ACCESS_TOKEN_SECRET: strongSecret('SUPER_ADMIN_ACCESS_TOKEN_SECRET'),
  SUPER_ADMIN_REFRESH_TOKEN_SECRET: strongSecret('SUPER_ADMIN_REFRESH_TOKEN_SECRET'),
  OTP_HASH_SECRET: strongSecret('OTP_HASH_SECRET'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  LEGACY_VERIFICATION_TOKEN_TTL: z.string().default('14d'),
  PASSWORD_HASH_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174'),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((value) => value.toLowerCase() === 'true'),
  COOKIE_DOMAIN: z.string().optional(),
  JSON_BODY_LIMIT: bodyLimit('JSON_BODY_LIMIT'),
  URLENCODED_BODY_LIMIT: bodyLimit('URLENCODED_BODY_LIMIT'),
  TRUST_PROXY: z.string().default('false'),
  REDIS_URL: z.url().optional(),
  PUBLIC_DEMO_ORG_ID: z.string().trim().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  process.stderr.write(
    `Invalid environment variables: ${JSON.stringify(parsed.error.issues, null, 2)}\n`
  );
  process.exit(1);
}

export const env = parsed.data;

export const getAllowedOrigins = (): string[] =>
  env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
