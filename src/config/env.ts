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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  USER_ACCESS_TOKEN_SECRET: z.string().min(32, 'USER_ACCESS_TOKEN_SECRET must be at least 32 characters'),
  USER_REFRESH_TOKEN_SECRET: z.string().min(32, 'USER_REFRESH_TOKEN_SECRET must be at least 32 characters'),
  SUPER_ADMIN_ACCESS_TOKEN_SECRET: z.string().min(32, 'SUPER_ADMIN_ACCESS_TOKEN_SECRET must be at least 32 characters'),
  SUPER_ADMIN_REFRESH_TOKEN_SECRET: z.string().min(32, 'SUPER_ADMIN_REFRESH_TOKEN_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174'),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
