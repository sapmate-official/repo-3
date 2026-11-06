import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import prisma from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../util/errors.js';
import { hashRefreshToken } from '../../util/tokenHash.js';
import { parseDurationMs } from '../../util/ttl.js';
import {
  type SuperAdminRefreshClaims,
  type UserRefreshClaims,
  signSuperAdminAccessToken,
  signSuperAdminRefreshToken,
  signUserAccessToken,
  signUserRefreshToken,
  verifySuperAdminRefreshToken,
  verifyUserRefreshToken
} from './token.service.js';

const REFRESH_TOKEN_TTL_MS = parseDurationMs(env.REFRESH_TOKEN_TTL);
const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface UserSessionSubject {
  id: string;
  email: string;
  orgId: string;
}

export interface SuperAdminSessionSubject {
  id: string;
  email: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

class SessionReuseError extends Error {
  constructor() {
    super('Refresh token session was already rotated');
    this.name = 'SessionReuseError';
  }
}

const sessionExpiry = (): Date => new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

const normalizedMeta = (meta: SessionMeta): { ipAddress: string | null; userAgent: string | null } => ({
  ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
  userAgent: meta.userAgent?.slice(0, 512) ?? null
});

const issueUserSession = async (
  tx: Prisma.TransactionClient,
  subject: UserSessionSubject,
  familyId: string,
  meta: SessionMeta
): Promise<TokenPair> => {
  const sessionId = crypto.randomUUID();
  const refreshToken = signUserRefreshToken({
    id: subject.id,
    email: subject.email,
    orgId: subject.orgId,
    sid: sessionId,
    fid: familyId
  });
  const { ipAddress, userAgent } = normalizedMeta(meta);

  await tx.authSession.create({
    data: {
      id: sessionId,
      userId: subject.id,
      orgId: subject.orgId,
      familyId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: sessionExpiry(),
      ipAddress,
      userAgent
    }
  });

  return {
    accessToken: signUserAccessToken({
      id: subject.id,
      email: subject.email,
      orgId: subject.orgId,
      sid: sessionId
    }),
    refreshToken
  };
};

const issueSuperAdminSession = async (
  tx: Prisma.TransactionClient,
  subject: SuperAdminSessionSubject,
  familyId: string,
  meta: SessionMeta
): Promise<TokenPair> => {
  const sessionId = crypto.randomUUID();
  const refreshToken = signSuperAdminRefreshToken({
    id: subject.id,
    email: subject.email,
    sid: sessionId,
    fid: familyId
  });
  const { ipAddress, userAgent } = normalizedMeta(meta);

  await tx.superAdminAuthSession.create({
    data: {
      id: sessionId,
      superAdminId: subject.id,
      familyId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: sessionExpiry(),
      ipAddress,
      userAgent
    }
  });

  return {
    accessToken: signSuperAdminAccessToken({
      id: subject.id,
      email: subject.email,
      sid: sessionId
    }),
    refreshToken
  };
};

export const createUserSession = async (
  subject: UserSessionSubject,
  meta: SessionMeta
): Promise<TokenPair> => {
  const familyId = crypto.randomUUID();
  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: subject.id },
      data: { refreshToken: null }
    });
    return issueUserSession(tx, subject, familyId, meta);
  });
};

export const createSuperAdminSession = async (
  subject: SuperAdminSessionSubject,
  meta: SessionMeta
): Promise<TokenPair> => {
  const familyId = crypto.randomUUID();
  return prisma.$transaction(async (tx) => {
    await tx.superAdmin.update({
      where: { id: subject.id },
      data: { refreshToken: null }
    });
    return issueSuperAdminSession(tx, subject, familyId, meta);
  });
};

export const revokeUserFamily = async (familyId: string): Promise<void> => {
  await prisma.authSession.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
};

export const revokeSuperAdminFamily = async (familyId: string): Promise<void> => {
  await prisma.superAdminAuthSession.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
};

const verifyUserSessionState = async (
  session: {
    id: string;
    userId: string;
    orgId: string | null;
    familyId: string;
    expiresAt: Date;
    revokedAt: Date | null;
  },
  decoded: UserRefreshClaims
): Promise<{ id: string; email: string; orgId: string }> => {
  if (session.revokedAt) {
    await revokeUserFamily(session.familyId);
    throw new AppError(
      'Refresh token reuse detected. Please sign in again.',
      401,
      'REFRESH_TOKEN_REUSED'
    );
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() }
    });
    throw new AppError('Invalid or expired refresh token.', 401, 'REFRESH_TOKEN_INVALID');
  }

  if (
    session.userId !== decoded.id ||
    session.familyId !== decoded.fid ||
    (session.orgId !== null && session.orgId !== decoded.orgId)
  ) {
    await revokeUserFamily(session.familyId);
    throw new AppError(
      'Refresh token reuse detected. Please sign in again.',
      401,
      'REFRESH_TOKEN_REUSED'
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { organization: { select: { isActive: true } } }
  });

  if (user?.status !== 'active' || !user.organization?.isActive) {
    await revokeUserFamily(session.familyId);
    throw new AppError('Account or organization is inactive.', 401, 'ACCOUNT_INACTIVE');
  }

  return { id: user.id, email: user.email, orgId: user.orgId };
};

const verifySuperAdminSessionState = async (
  session: {
    id: string;
    superAdminId: string;
    familyId: string;
    expiresAt: Date;
    revokedAt: Date | null;
  },
  decoded: SuperAdminRefreshClaims
): Promise<{ id: string; email: string }> => {
  if (session.revokedAt) {
    await revokeSuperAdminFamily(session.familyId);
    throw new AppError(
      'Refresh token reuse detected. Please sign in again.',
      401,
      'REFRESH_TOKEN_REUSED'
    );
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.superAdminAuthSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() }
    });
    throw new AppError('Invalid or expired refresh token.', 401, 'REFRESH_TOKEN_INVALID');
  }

  if (session.superAdminId !== decoded.id || session.familyId !== decoded.fid) {
    await revokeSuperAdminFamily(session.familyId);
    throw new AppError(
      'Refresh token reuse detected. Please sign in again.',
      401,
      'REFRESH_TOKEN_REUSED'
    );
  }

  const superAdmin = await prisma.superAdmin.findUnique({
    where: { id: session.superAdminId },
    select: { id: true, email: true }
  });

  if (!superAdmin) {
    await revokeSuperAdminFamily(session.familyId);
    throw new AppError('Super-admin account not found.', 401, 'ACCOUNT_INACTIVE');
  }

  return superAdmin;
};

export const rotateUserSession = async (
  incomingRefreshToken: string,
  meta: SessionMeta
): Promise<TokenPair> => {
  let decoded: UserRefreshClaims;
  try {
    decoded = verifyUserRefreshToken(incomingRefreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token.', 401, 'REFRESH_TOKEN_INVALID');
  }

  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashRefreshToken(incomingRefreshToken) }
  });

  if (!session) {
    throw new AppError('Invalid or expired refresh token.', 401, 'REFRESH_TOKEN_INVALID');
  }

  const subject = await verifyUserSessionState(session, decoded);
  const { ipAddress, userAgent } = normalizedMeta(meta);

  try {
    return await prisma.$transaction(async (tx) => {
      const newSessionId = crypto.randomUUID();
      const refreshToken = signUserRefreshToken({
        id: subject.id,
        email: subject.email,
        orgId: subject.orgId,
        sid: newSessionId,
        fid: session.familyId
      });

      const claimed = await tx.authSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: newSessionId }
      });

      if (claimed.count !== 1) {
        throw new SessionReuseError();
      }

      await tx.authSession.create({
        data: {
          id: newSessionId,
          userId: subject.id,
          orgId: subject.orgId,
          familyId: session.familyId,
          tokenHash: hashRefreshToken(refreshToken),
          expiresAt: sessionExpiry(),
          ipAddress,
          userAgent
        }
      });

      await tx.user.update({
        where: { id: subject.id },
        data: { refreshToken: null }
      });

      return {
        accessToken: signUserAccessToken({
          id: subject.id,
          email: subject.email,
          orgId: subject.orgId,
          sid: newSessionId
        }),
        refreshToken
      };
    });
  } catch (error) {
    if (error instanceof SessionReuseError) {
      await revokeUserFamily(session.familyId);
      throw new AppError(
        'Refresh token reuse detected. Please sign in again.',
        401,
        'REFRESH_TOKEN_REUSED'
      );
    }
    throw error;
  }
};

export const rotateSuperAdminSession = async (
  incomingRefreshToken: string,
  meta: SessionMeta
): Promise<TokenPair> => {
  let decoded: SuperAdminRefreshClaims;
  try {
    decoded = verifySuperAdminRefreshToken(incomingRefreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token.', 401, 'REFRESH_TOKEN_INVALID');
  }

  const session = await prisma.superAdminAuthSession.findUnique({
    where: { tokenHash: hashRefreshToken(incomingRefreshToken) }
  });

  if (!session) {
    throw new AppError('Invalid or expired refresh token.', 401, 'REFRESH_TOKEN_INVALID');
  }

  const subject = await verifySuperAdminSessionState(session, decoded);
  const { ipAddress, userAgent } = normalizedMeta(meta);

  try {
    return await prisma.$transaction(async (tx) => {
      const newSessionId = crypto.randomUUID();
      const refreshToken = signSuperAdminRefreshToken({
        id: subject.id,
        email: subject.email,
        sid: newSessionId,
        fid: session.familyId
      });

      const claimed = await tx.superAdminAuthSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: newSessionId }
      });

      if (claimed.count !== 1) {
        throw new SessionReuseError();
      }

      await tx.superAdminAuthSession.create({
        data: {
          id: newSessionId,
          superAdminId: subject.id,
          familyId: session.familyId,
          tokenHash: hashRefreshToken(refreshToken),
          expiresAt: sessionExpiry(),
          ipAddress,
          userAgent
        }
      });

      await tx.superAdmin.update({
        where: { id: subject.id },
        data: { refreshToken: null }
      });

      return {
        accessToken: signSuperAdminAccessToken({
          id: subject.id,
          email: subject.email,
          sid: newSessionId
        }),
        refreshToken
      };
    });
  } catch (error) {
    if (error instanceof SessionReuseError) {
      await revokeSuperAdminFamily(session.familyId);
      throw new AppError(
        'Refresh token reuse detected. Please sign in again.',
        401,
        'REFRESH_TOKEN_REUSED'
      );
    }
    throw error;
  }
};

export const revokeUserSessions = async (userId: string): Promise<void> => {
  await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: userId },
      data: { refreshToken: null }
    }),
    prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    })
  ]);
};

export const revokeSuperAdminSessions = async (superAdminId: string): Promise<void> => {
  await prisma.$transaction([
    prisma.superAdmin.updateMany({
      where: { id: superAdminId },
      data: { refreshToken: null }
    }),
    prisma.superAdminAuthSession.updateMany({
      where: { superAdminId, revokedAt: null },
      data: { revokedAt: new Date() }
    })
  ]);
};

export const revokeUserSessionsInTransaction = async (
  tx: Prisma.TransactionClient,
  userId: string
): Promise<void> => {
  await tx.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
};

export const cleanupExpiredSessions = async (): Promise<void> => {
  const cutoff = new Date(Date.now() - SESSION_RETENTION_MS);
  const [userSessions, superAdminSessions] = await prisma.$transaction([
    prisma.authSession.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
    prisma.superAdminAuthSession.deleteMany({ where: { expiresAt: { lt: cutoff } } })
  ]);

  if (userSessions.count > 0 || superAdminSessions.count > 0) {
    logger.info(
      { userSessions: userSessions.count, superAdminSessions: superAdminSessions.count },
      'Removed expired auth sessions'
    );
  }
};
