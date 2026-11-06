import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

const JWT_ISSUER = 'alkaa-backend-ts';
const JWT_AUDIENCE = 'alkaa-clients';
const JWT_ALGORITHM = 'HS256' as const;

const accessOptions: jwt.SignOptions = {
  algorithm: JWT_ALGORITHM,
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
  expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn']
};

const refreshOptions: jwt.SignOptions = {
  algorithm: JWT_ALGORITHM,
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
  expiresIn: env.REFRESH_TOKEN_TTL as jwt.SignOptions['expiresIn']
};

const verifyOptions: jwt.VerifyOptions = {
  algorithms: [JWT_ALGORITHM],
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
  clockTolerance: 5
};

export class TokenTypeError extends jwt.JsonWebTokenError {
  constructor(message = 'Invalid token type') {
    super(message);
    this.name = 'TokenTypeError';
  }
}

export interface UserAccessClaims {
  id: string;
  email: string;
  orgId: string;
  typ: 'user';
  sid?: string;
}

export interface UserRefreshClaims {
  id: string;
  email: string;
  orgId: string;
  typ: 'user_refresh';
  sid: string;
  fid: string;
}

export interface SuperAdminAccessClaims {
  id: string;
  email: string;
  typ: 'super_admin';
  sid?: string;
}

export interface SuperAdminRefreshClaims {
  id: string;
  email: string;
  typ: 'super_admin_refresh';
  sid: string;
  fid: string;
}

export const signUserAccessToken = (payload: {
  id: string;
  email: string;
  orgId: string;
  sid: string;
}): string =>
  jwt.sign({ ...payload, typ: 'user' }, env.USER_ACCESS_TOKEN_SECRET, accessOptions);

export const signUserRefreshToken = (payload: {
  id: string;
  email: string;
  orgId: string;
  sid: string;
  fid: string;
}): string =>
  jwt.sign({ ...payload, typ: 'user_refresh' }, env.USER_REFRESH_TOKEN_SECRET, refreshOptions);

export const signSuperAdminAccessToken = (payload: {
  id: string;
  email: string;
  sid: string;
}): string =>
  jwt.sign({ ...payload, typ: 'super_admin' }, env.SUPER_ADMIN_ACCESS_TOKEN_SECRET, accessOptions);

export const signSuperAdminRefreshToken = (payload: {
  id: string;
  email: string;
  sid: string;
  fid: string;
}): string =>
  jwt.sign(
    { ...payload, typ: 'super_admin_refresh' },
    env.SUPER_ADMIN_REFRESH_TOKEN_SECRET,
    refreshOptions
  );

interface DecodedClaims extends jwt.JwtPayload {
  typ?: unknown;
  id?: unknown;
  orgId?: unknown;
  sid?: unknown;
  fid?: unknown;
}

const decodePayload = (token: string, secret: string, expectedType: string): DecodedClaims => {
  const decoded = jwt.verify(token, secret, verifyOptions);
  if (typeof decoded === 'string') {
    throw new jwt.JsonWebTokenError('Invalid token payload');
  }

  const payload = decoded as DecodedClaims;
  if (payload.typ !== expectedType || typeof payload.id !== 'string') {
    throw new TokenTypeError();
  }

  return payload;
};

export const verifyUserAccessToken = (token: string): UserAccessClaims => {
  const payload = decodePayload(token, env.USER_ACCESS_TOKEN_SECRET, 'user');
  if (typeof payload.orgId !== 'string') {
    throw new jwt.JsonWebTokenError('Missing organization claim');
  }
  return payload as unknown as UserAccessClaims;
};

export const verifyUserRefreshToken = (token: string): UserRefreshClaims => {
  const payload = decodePayload(token, env.USER_REFRESH_TOKEN_SECRET, 'user_refresh');
  if (
    typeof payload.orgId !== 'string' ||
    typeof payload.sid !== 'string' ||
    typeof payload.fid !== 'string'
  ) {
    throw new jwt.JsonWebTokenError('Missing refresh token claims');
  }
  return payload as unknown as UserRefreshClaims;
};

export const verifySuperAdminAccessToken = (token: string): SuperAdminAccessClaims =>
  decodePayload(
    token,
    env.SUPER_ADMIN_ACCESS_TOKEN_SECRET,
    'super_admin'
  ) as unknown as SuperAdminAccessClaims;

export const verifySuperAdminRefreshToken = (token: string): SuperAdminRefreshClaims => {
  const payload = decodePayload(
    token,
    env.SUPER_ADMIN_REFRESH_TOKEN_SECRET,
    'super_admin_refresh'
  );
  if (typeof payload.sid !== 'string' || typeof payload.fid !== 'string') {
    throw new jwt.JsonWebTokenError('Missing refresh token claims');
  }
  return payload as unknown as SuperAdminRefreshClaims;
};
