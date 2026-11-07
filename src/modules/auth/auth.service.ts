import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { type Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import prisma from '../../db/prisma.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../util/errors.js';
import {
  hashPassword,
  needsRehash,
  verifyAgainstDummyHash,
  verifyPassword as verifyPasswordHash
} from '../../util/password.js';
import {
  hashOtp,
  otpMatches,
  verificationTokenCandidates,
  verificationTokenMatches
} from '../../util/tokenHash.js';
import { parseDurationMs } from '../../util/ttl.js';
import {
  createSuperAdminSession,
  createUserSession,
  revokeSuperAdminSessions,
  revokeUserSessions,
  revokeUserSessionsInTransaction,
  rotateSuperAdminSession,
  rotateUserSession,
  type SessionMeta
} from './authSession.service.js';
import { verifySuperAdminRefreshToken } from './token.service.js';
import type {
  CheckEmailResponse,
  LoginSuccessResponse,
  LoginOtpRequiredResponse,
  TokenPair,
  UserSummaryDTO
} from './auth.types.js';

const emailMatch = (normalizedEmail: string): Prisma.UserWhereInput => ({
  OR: [
    { email: normalizedEmail },
    { businessEmail: normalizedEmail },
    { personalEmail: normalizedEmail }
  ]
});

const invalidCredentials = (): AppError =>
  new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');

const displayName = (
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback: string
): string => {
  const name = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  return name.length > 0 ? name : fallback;
};

export class AuthService {
  // Multi-tenant check email (supports personalEmail and businessEmail)
  static async checkEmail(email: string): Promise<CheckEmailResponse> {
    const normalizedEmail = email.toLowerCase().trim();

    const superAdmin = await prisma.superAdmin.findFirst({
      where: { email: normalizedEmail }
    });

    if (superAdmin) {
      return {
        singleOrganization: true,
        organization: {
          orgId: 'platform-superadmin',
          orgName: 'Platform Administration',
          userId: superAdmin.id,
          userStatus: 'active'
        },
        message: 'Super Admin identified'
      };
    }

    const users = await prisma.user.findMany({
      where: {
        ...emailMatch(normalizedEmail),
        status: { in: ['active', 'inactive'] }
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            isActive: true
          }
        }
      }
    });

    if (users.length === 0) {
      throw new AppError('User not found with this email.', 404, 'USER_NOT_FOUND');
    }

    const activeOrgUsers = users.filter((user) => user.organization?.isActive);
    if (activeOrgUsers.length === 0) {
      throw new AppError(
        'Your organization account is inactive. Please contact support.',
        403,
        'ORGANIZATION_INACTIVE'
      );
    }

    if (activeOrgUsers.length === 1) {
      const user = activeOrgUsers[0];
      if (!user) {
        throw new AppError('User not found with this email.', 404, 'USER_NOT_FOUND');
      }
      return {
        singleOrganization: true,
        organization: {
          orgId: user.organization.id,
          orgName: user.organization.name,
          userId: user.id,
          userStatus: user.status
        },
        message: 'Single organization found'
      };
    }

    return {
      singleOrganization: false,
      multipleOrganizations: true,
      organizations: activeOrgUsers.map((user) => ({
        orgId: user.organization.id,
        orgName: user.organization.name,
        userId: user.id,
        userStatus: user.status
      })),
      message: 'Multiple organizations found. Please select one.'
    };
  }

  static async verifyPassword(
    email: string,
    password: string,
    orgId?: string,
    meta: SessionMeta = {}
  ): Promise<{ response: LoginSuccessResponse | LoginOtpRequiredResponse; tokens?: TokenPair }> {
    const normalizedEmail = email.toLowerCase().trim();

    // 1. SuperAdmin authentication
    const superAdmin = await prisma.superAdmin.findFirst({
      where: { email: normalizedEmail }
    });

    if (superAdmin) {
      const isValid = await verifyPasswordHash(password, superAdmin.hashedPassword);
      if (!isValid) {
        throw invalidCredentials();
      }

      if (needsRehash(superAdmin.hashedPassword)) {
        await prisma.superAdmin.update({
          where: { id: superAdmin.id },
          data: { hashedPassword: await hashPassword(password) }
        });
      }

      const tokens = await createSuperAdminSession(
        { id: superAdmin.id, email: superAdmin.email },
        meta
      );

      return {
        tokens,
        response: {
          message: 'Super Admin authenticated successfully',
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          organization: {
            id: 'platform-superadmin',
            name: 'Platform Administration'
          },
          user: {
            id: superAdmin.id,
            email: superAdmin.email,
            name: superAdmin.name,
            firstName: superAdmin.name,
            isSuperAdmin: true,
            superAdmin: true,
            status: 'active',
            roles: ['SUPER_ADMIN'],
            permissions: ['*']
          }
        }
      };
    }

    // 2. Organization user authentication. Without an explicit orgId we must
    // never guess between multiple organizations sharing an email domain.
    const users = await prisma.user.findMany({
      where: {
        ...emailMatch(normalizedEmail),
        ...(orgId ? { orgId } : {})
      },
      include: {
        organization: { select: { id: true, name: true, isActive: true } },
        roles: {
          select: {
            role: {
              select: {
                name: true,
                permissions: { select: { permission: { select: { key: true } } } }
              }
            }
          }
        }
      },
      take: orgId ? 1 : 2
    });

    const user = users[0];
    if (!user?.hashedPassword) {
      await verifyAgainstDummyHash(password);
      throw invalidCredentials();
    }

    if (!orgId && users.length > 1) {
      throw new AppError(
        'Multiple organizations found. Please select an organization.',
        409,
        'ORG_SELECTION_REQUIRED'
      );
    }

    if (!user.organization?.isActive) {
      throw new AppError(
        'Organization account is inactive.',
        403,
        'ORGANIZATION_INACTIVE'
      );
    }

    if (user.status === 'suspended') {
      throw new AppError('User is suspended.', 403, 'USER_SUSPENDED');
    }

    if (user.status === 'inactive') {
      throw new AppError('User is inactive.', 403, 'USER_INACTIVE');
    }

    const isValid = await verifyPasswordHash(password, user.hashedPassword);
    if (!isValid) {
      throw invalidCredentials();
    }

    if (needsRehash(user.hashedPassword)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { hashedPassword: await hashPassword(password) }
      });
    }

    // If 2FA is required, issue a hashed, expiring, rate-limited OTP.
    if (user.twoFactorEnabled) {
      const otpCode = crypto.randomInt(100000, 1000000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await prisma.emailOtpVerification.updateMany({
        where: { userId: user.id, purpose: 'LOGIN', isUsed: false },
        data: { isUsed: true }
      });

      await prisma.emailOtpVerification.create({
        data: {
          userId: user.id,
          otpCode: hashOtp(otpCode),
          purpose: 'LOGIN',
          expiresAt,
          isUsed: false,
          attemptsCount: 0,
          maxAttempts: 3,
          ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
          userAgent: meta.userAgent?.slice(0, 512) ?? null
        }
      });

      logger.info({ userId: user.id }, 'Generated hashed OTP for 2FA login');

      return {
        response: {
          message: 'Two-factor OTP required',
          requiresTwoFactor: true,
          userId: user.id,
          email: user.email
        }
      };
    }

    const tokens = await createUserSession(
      { id: user.id, email: user.email, orgId: user.orgId },
      meta
    );

    const rolesSet = new Set<string>();
    const permissionsSet = new Set<string>();
    for (const userRole of user.roles) {
      if (userRole.role?.name) {
        rolesSet.add(userRole.role.name);
      }
      for (const rolePermission of userRole.role?.permissions || []) {
        if (rolePermission.permission?.key) {
          permissionsSet.add(rolePermission.permission.key);
        }
      }
    }
    const roles = Array.from(rolesSet);
    const permissions = Array.from(permissionsSet);

    return {
      tokens,
      response: {
        message: 'Login successful',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        organization: {
          id: user.organization.id,
          name: user.organization.name
        },
        user: {
          id: user.id,
          email: user.email,
          businessEmail: user.businessEmail,
          personalEmail: user.personalEmail,
          firstName: user.firstName,
          lastName: user.lastName,
          name: displayName(user.firstName, user.lastName, user.email),
          orgId: user.orgId,
          roles,
          permissions,
          status: user.status
        }
      }
    };
  }

  // OTP Verification for 2FA
  static async verifyOtp(params: {
    email?: string;
    sessionToken?: string;
    otpCode: string;
    orgId?: string;
    meta?: SessionMeta;
  }): Promise<{ response: LoginSuccessResponse; tokens: TokenPair }> {
    const { email, sessionToken, otpCode, orgId, meta = {} } = params;

    let targetUserId: string | null = null;

    if (sessionToken) {
      const session = await prisma.tempLoginSession.findFirst({
        where: {
          sessionToken: { in: verificationTokenCandidates(sessionToken) },
          expiresAt: { gt: new Date() },
          isUsed: false
        }
      });
      if (!session) {
        throw new AppError('Invalid or expired login session.', 401, 'INVALID_LOGIN_SESSION');
      }
      targetUserId = session.userId;
      await prisma.tempLoginSession.update({
        where: { id: session.id },
        data: { isUsed: true }
      });
    } else if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const users = await prisma.user.findMany({
        where: {
          ...emailMatch(normalizedEmail),
          ...(orgId ? { orgId } : {})
        },
        take: orgId ? 1 : 2
      });
      if (users.length === 0) {
        throw new AppError('Invalid or expired OTP.', 401, 'INVALID_OTP');
      }
      if (!orgId && users.length > 1) {
        throw new AppError(
          'Multiple organizations found. Please select an organization.',
          409,
          'ORG_SELECTION_REQUIRED'
        );
      }
      const user = users[0];
      if (!user) {
        throw new AppError('Invalid or expired OTP.', 401, 'INVALID_OTP');
      }
      targetUserId = user.id;
    }

    if (!targetUserId) {
      throw new AppError(
        'Unable to identify user for OTP verification.',
        400,
        'OTP_USER_REQUIRED'
      );
    }

    const otpRecord = await prisma.emailOtpVerification.findFirst({
      where: {
        userId: targetUserId,
        purpose: 'LOGIN',
        expiresAt: { gt: new Date() },
        isUsed: false
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!otpRecord) {
      throw new AppError('Invalid or expired OTP.', 401, 'INVALID_OTP');
    }

    if (otpRecord.attemptsCount >= otpRecord.maxAttempts) {
      await prisma.emailOtpVerification.update({
        where: { id: otpRecord.id },
        data: { isUsed: true }
      });
      throw new AppError(
        'Maximum OTP attempts exceeded. Please request a new code.',
        429,
        'OTP_ATTEMPTS_EXCEEDED'
      );
    }

    if (!otpMatches(otpRecord.otpCode, otpCode)) {
      const nextAttempts = otpRecord.attemptsCount + 1;
      await prisma.emailOtpVerification.update({
        where: { id: otpRecord.id },
        data: {
          attemptsCount: { increment: 1 },
          ...(nextAttempts >= otpRecord.maxAttempts ? { isUsed: true } : {})
        }
      });
      throw new AppError('Invalid OTP code.', 401, 'INVALID_OTP');
    }

    await prisma.emailOtpVerification.update({
      where: { id: otpRecord.id },
      data: { isUsed: true, usedAt: new Date() }
    });

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        organization: { select: { id: true, name: true, isActive: true } },
        roles: {
          select: {
            role: {
              select: {
                name: true,
                permissions: { select: { permission: { select: { key: true } } } }
              }
            }
          }
        }
      }
    });

    if (user?.status !== 'active' || !user.organization?.isActive) {
      throw new AppError(
        'User account or organization is inactive.',
        403,
        'ACCOUNT_INACTIVE'
      );
    }

    const tokens = await createUserSession(
      { id: user.id, email: user.email, orgId: user.orgId },
      meta
    );

    const rolesSet = new Set<string>();
    const permissionsSet = new Set<string>();
    for (const userRole of user.roles) {
      if (userRole.role?.name) {
        rolesSet.add(userRole.role.name);
      }
      for (const rolePermission of userRole.role?.permissions || []) {
        if (rolePermission.permission?.key) {
          permissionsSet.add(rolePermission.permission.key);
        }
      }
    }
    const roles = Array.from(rolesSet);
    const permissions = Array.from(permissionsSet);

    return {
      tokens,
      response: {
        message: 'Login successful',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        organization: {
          id: user.organization.id,
          name: user.organization.name
        },
        user: {
          id: user.id,
          email: user.email,
          businessEmail: user.businessEmail,
          personalEmail: user.personalEmail,
          firstName: user.firstName,
          lastName: user.lastName,
          name: displayName(user.firstName, user.lastName, user.email),
          orgId: user.orgId,
          roles,
          permissions,
          status: user.status
        }
      }
    };
  }

  // Secure password setup: token hash + expiry + single use + session revocation.
  static async setPassword(
    password: string,
    verificationToken: string
  ): Promise<UserSummaryDTO> {
    if (
      !verificationToken ||
      typeof verificationToken !== 'string' ||
      verificationToken.trim() === ''
    ) {
      throw new AppError(
        'A valid verification token must be provided.',
        400,
        'VERIFICATION_TOKEN_REQUIRED'
      );
    }

    const token = verificationToken.trim();
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: { in: verificationTokenCandidates(token) }
      }
    });

    if (!user?.verificationToken) {
      throw new AppError(
        'Invalid or expired verification token.',
        400,
        'INVALID_VERIFICATION_TOKEN'
      );
    }

    if (!verificationTokenMatches(user.verificationToken, token)) {
      throw new AppError(
        'Invalid or expired verification token.',
        400,
        'INVALID_VERIFICATION_TOKEN'
      );
    }

    const legacyExpiry = new Date(
      user.createdAt.getTime() + parseDurationMs(env.LEGACY_VERIFICATION_TOKEN_TTL)
    );
    const expiresAt = user.verificationTokenExpiry ?? legacyExpiry;

    if (expiresAt.getTime() <= Date.now()) {
      throw new AppError(
        'Invalid or expired verification token.',
        400,
        'INVALID_VERIFICATION_TOKEN'
      );
    }

    const hashedPassword = await hashPassword(password);

    const updatedUser = await prisma.$transaction(async (tx) => {
      await revokeUserSessionsInTransaction(tx, user.id);
      return tx.user.update({
        where: { id: user.id },
        data: {
          hashedPassword,
          status: 'active',
          verificationToken: null,
          verificationTokenExpiry: null,
          refreshToken: null
        },
        select: {
          id: true,
          email: true,
          businessEmail: true,
          personalEmail: true,
          firstName: true,
          lastName: true,
          orgId: true,
          status: true
        }
      });
    });

    logger.info(
      { userId: updatedUser.id },
      'Password set, verification token invalidated and sessions revoked'
    );

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      businessEmail: updatedUser.businessEmail,
      personalEmail: updatedUser.personalEmail,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      orgId: updatedUser.orgId,
      status: updatedUser.status,
      name: displayName(updatedUser.firstName, updatedUser.lastName, updatedUser.email)
    };
  }

  // Refresh token rotation with reuse detection and session-family revocation.
  static async refreshToken(
    incomingRefreshToken: string,
    meta: SessionMeta = {}
  ): Promise<TokenPair> {
    try {
      // Determine token type by signature before touching the session store.
      verifySuperAdminRefreshToken(incomingRefreshToken);
      return await rotateSuperAdminSession(incomingRefreshToken, meta);
    } catch (error) {
      if (error instanceof AppError && error.code === 'REFRESH_TOKEN_REUSED') {
        throw error;
      }

      if (!(error instanceof jwt.TokenExpiredError) && !(error instanceof jwt.JsonWebTokenError)) {
        throw error;
      }
    }

    return rotateUserSession(incomingRefreshToken, meta);
  }

  // Logout - revoke all sessions for the account.
  static async logout(userId: string, isSuperAdmin = false): Promise<void> {
    if (isSuperAdmin) {
      await revokeSuperAdminSessions(userId);
      return;
    }

    await revokeUserSessions(userId);
  }

  // Get full user profile for token validation
  static async getUserProfile(
    userId: string,
    orgId?: string,
    isSuperAdmin = false
  ): Promise<UserSummaryDTO> {
    if (isSuperAdmin) {
      const superAdmin = await prisma.superAdmin.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true
        }
      });

      if (!superAdmin) {
        throw new AppError('Super-admin not found.', 404, 'SUPERADMIN_NOT_FOUND');
      }

      return {
        id: superAdmin.id,
        email: superAdmin.email,
        name: superAdmin.name,
        firstName: superAdmin.name,
        superAdmin: true,
        isSuperAdmin: true,
        status: 'active',
        roles: ['SUPER_ADMIN'],
        permissions: ['*']
      };
    }

    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        ...(orgId ? { orgId } : {})
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            isActive: true
          }
        },
        department: {
          select: {
            id: true,
            name: true
          }
        },
        roles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
                permissions: {
                  select: {
                    permission: {
                      select: {
                        id: true,
                        key: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!user) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    if (user.status !== 'active') {
      throw new AppError('User account is inactive.', 403, 'USER_INACTIVE');
    }

    if (!user.organization?.isActive) {
      throw new AppError('Organization is inactive.', 403, 'ORGANIZATION_INACTIVE');
    }

    const rolesSet = new Set<string>();
    const permissionsSet = new Set<string>();
    for (const userRole of user.roles) {
      if (userRole.role?.name) {
        rolesSet.add(userRole.role.name);
      }
      for (const rolePermission of userRole.role?.permissions || []) {
        if (rolePermission.permission?.key) {
          permissionsSet.add(rolePermission.permission.key);
        }
      }
    }
    const roles = Array.from(rolesSet);
    const permissions = Array.from(permissionsSet);

    return {
      id: user.id,
      email: user.email,
      businessEmail: user.businessEmail,
      personalEmail: user.personalEmail,
      firstName: user.firstName,
      lastName: user.lastName,
      name: displayName(user.firstName, user.lastName, user.email),
      orgId: user.orgId,
      status: user.status,
      roles,
      permissions,
      isSuperAdmin: false,
      organization: user.organization,
      department: user.department
    };
  }
}
