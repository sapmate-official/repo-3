import bcrypt from 'bcrypt';
import { env } from '../config/env.js';

export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, env.PASSWORD_HASH_ROUNDS);

export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);

export const needsRehash = (hash: string): boolean => {
  try {
    return bcrypt.getRounds(hash) < env.PASSWORD_HASH_ROUNDS;
  } catch {
    return true;
  }
};

let dummyHashPromise: Promise<string> | undefined;

export const verifyAgainstDummyHash = async (password: string): Promise<void> => {
  dummyHashPromise ??= hashPassword('invalid-password-placeholder-value');
  await bcrypt.compare(password, await dummyHashPromise);
};
