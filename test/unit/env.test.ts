import { describe, expect, it } from 'vitest';
import { envSchema } from '../../src/config/env.js';

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/alkaa_test',
  USER_ACCESS_TOKEN_SECRET: 'user-access-0123456789-ABCDEFGHIJKL',
  USER_REFRESH_TOKEN_SECRET: 'user-refresh-9876543210-ZYXWVUTSRQPO',
  SUPER_ADMIN_ACCESS_TOKEN_SECRET: 'super-access-abcdef-0123456789-XYZ',
  SUPER_ADMIN_REFRESH_TOKEN_SECRET: 'super-refresh-qwerty-0123456789-ABC',
  OTP_HASH_SECRET: 'otp-hmac-secret-0123456789-abcdefgh'
};

describe('envSchema', () => {
  it('parses COOKIE_SECURE=false as false', () => {
    const parsed = envSchema.parse({ ...baseEnv, COOKIE_SECURE: 'false' });
    expect(parsed.COOKIE_SECURE).toBe(false);
  });

  it('parses COOKIE_SECURE=true as true', () => {
    const parsed = envSchema.parse({ ...baseEnv, COOKIE_SECURE: 'true' });
    expect(parsed.COOKIE_SECURE).toBe(true);
  });

  it('treats COOKIE_SECURE case-insensitively', () => {
    expect(envSchema.parse({ ...baseEnv, COOKIE_SECURE: 'TRUE' }).COOKIE_SECURE).toBe(true);
  });

  it('treats any non-"true" value as false', () => {
    expect(envSchema.parse({ ...baseEnv, COOKIE_SECURE: '1' }).COOKIE_SECURE).toBe(false);
    expect(envSchema.parse({ ...baseEnv, COOKIE_SECURE: 'yes' }).COOKIE_SECURE).toBe(false);
  });

  it('defaults COOKIE_SECURE to false', () => {
    expect(envSchema.parse(baseEnv).COOKIE_SECURE).toBe(false);
  });

  it('applies defaults for TTLs and CORS', () => {
    const parsed = envSchema.parse(baseEnv);
    expect(parsed.ACCESS_TOKEN_TTL).toBe('15m');
    expect(parsed.REFRESH_TOKEN_TTL).toBe('7d');
    expect(parsed.CORS_ORIGINS).toContain('http://localhost:5173');
    expect(parsed.PORT).toBe(5001);
  });

  it('accepts an optional COOKIE_DOMAIN', () => {
    const parsed = envSchema.parse({ ...baseEnv, COOKIE_DOMAIN: '.alkaa.online' });
    expect(parsed.COOKIE_DOMAIN).toBe('.alkaa.online');
  });

  it('rejects secrets shorter than 32 characters', () => {
    expect(() => envSchema.parse({ ...baseEnv, USER_ACCESS_TOKEN_SECRET: 'short' })).toThrow();
  });

  it('rejects low-entropy secrets', () => {
    expect(() =>
      envSchema.parse({ ...baseEnv, USER_ACCESS_TOKEN_SECRET: 'a'.repeat(40) })
    ).toThrow(/distinct/);
  });

  it('requires an OTP hash secret', () => {
    const { OTP_HASH_SECRET: _ignored, ...withoutOtpSecret } = baseEnv;
    expect(() => envSchema.parse(withoutOtpSecret)).toThrow(/OTP_HASH_SECRET/);
  });

  it('rejects invalid body limits', () => {
    expect(() => envSchema.parse({ ...baseEnv, JSON_BODY_LIMIT: '10gb' })).toThrow(/BODY_LIMIT/);
  });

  it('rejects an out-of-range port', () => {
    expect(() => envSchema.parse({ ...baseEnv, PORT: '70000' })).toThrow();
  });

  it('rejects a missing database URL', () => {
    const { DATABASE_URL: _ignored, ...withoutDatabase } = baseEnv;
    expect(() => envSchema.parse(withoutDatabase)).toThrow();
  });
});
