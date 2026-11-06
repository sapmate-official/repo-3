import crypto from 'crypto';
import { env } from '../config/env.js';

const HASH_PREFIX = 'sha256:';
const OTP_PREFIX = 'hmac:';

export const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value, 'utf8').digest('hex');

export const hashRefreshToken = (token: string): string => sha256(token);

export const hashVerificationToken = (token: string): string => `${HASH_PREFIX}${sha256(token)}`;

export const hashOtp = (otp: string): string =>
  `${OTP_PREFIX}${crypto.createHmac('sha256', env.OTP_HASH_SECRET).update(otp, 'utf8').digest('hex')}`;

export const constantTimeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const verificationTokenMatches = (storedValue: string, candidate: string): boolean => {
  if (storedValue.startsWith(HASH_PREFIX)) {
    return constantTimeEqual(storedValue, hashVerificationToken(candidate));
  }
  return constantTimeEqual(storedValue, candidate);
};

export const otpMatches = (storedValue: string, candidate: string): boolean => {
  if (storedValue.startsWith(OTP_PREFIX)) {
    return constantTimeEqual(storedValue, hashOtp(candidate));
  }
  return constantTimeEqual(storedValue, candidate);
};

export const verificationTokenCandidates = (token: string): string[] => {
  const hash = hashVerificationToken(token);
  return hash === token ? [hash] : [hash, token];
};
