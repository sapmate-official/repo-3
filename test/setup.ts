process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL ??= 'error';

const fallbackEnv: Record<string, string> = {
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/alkaa_test?sslmode=disable',
  USER_ACCESS_TOKEN_SECRET: 'test_user_access_secret_at_least_32_chars_long',
  USER_REFRESH_TOKEN_SECRET: 'test_user_refresh_secret_at_least_32_chars_long',
  SUPER_ADMIN_ACCESS_TOKEN_SECRET: 'test_super_access_secret_at_least_32_chars_long',
  SUPER_ADMIN_REFRESH_TOKEN_SECRET: 'test_super_refresh_secret_at_least_32_chars_long',
  OTP_HASH_SECRET: 'test_otp_hash_secret_at_least_32_chars_long',
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL: '7d',
  CORS_ORIGINS: 'http://localhost:5173',
  COOKIE_SECURE: 'false'
};

for (const [key, value] of Object.entries(fallbackEnv)) {
  process.env[key] ??= value;
}
