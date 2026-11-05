import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { env } from '../../config/env.js';
import prisma from '../../db/prisma.js';
import { logger } from '../../config/logger.js';
import {
  CheckEmailResponse,
  LoginSuccessResponse,
  LoginOtpRequiredResponse,
  TokenPair,
  UserSummaryDTO
} from './auth.types.js';

interface DecodedTokenPayload {
  id: string;
  email: string;
  orgId?: string;
  typ?: string;
}

export class AuthService {
  // Generate JWT tokens for standard organization users
  static generateUserTokens(payload: { id: string; email: string; orgId: string }): TokenPair {
    const accessToken = jwt.sign(
      {
        id: payload.id,
        email: payload.email,
        orgId: payload.orgId,
        typ: 'user'
      },
      env.USER_ACCESS_TOKEN_SECRET,
      { expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'] }
    );

    const refreshToken = jwt.sign(
      {
        id: payload.id,
        email: payload.email,
        orgId: payload.orgId,
        typ: 'user'
      },
      env.USER_REFRESH_TOKEN_SECRET,
      { expiresIn: env.REFRESH_TOKEN_TTL as jwt.SignOptions['expiresIn'] }
    );

    return { accessToken, refreshToken };
  }

  // Generate JWT tokens for platform super administrators
  static generateSuperAdminTokens(payload: { id: string; email: string }): TokenPair {
    const accessToken = jwt.sign(
      {
        id: payload.id,
        email: payload.email,
        typ: 'super_admin'
      },
      env.SUPER_ADMIN_ACCESS_TOKEN_SECRET,
      { expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'] }
    );

    const refreshToken = jwt.sign(
      {
        id: payload.id,
        email: payload.email,
        typ: 'super_admin'
      },
      env.SUPER_ADMIN_REFRESH_TOKEN_SECRET,
      { expiresIn: env.REFRESH_TOKEN_TTL as jwt.SignOptions['expiresIn'] }
    );

    return { accessToken, refreshToken };
  }

  // Multi-tenant check email (supports personalEmail and businessEmail)
  static async checkEmail(email: string): Promise<CheckEmailResponse> {
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Check for platform SuperAdmin
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

    // 2. Check for Organization Users (matching email, businessEmail, or personalEmail)
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { email: normalizedEmail },
          { businessEmail: normalizedEmail },
          { personalEmail: normalizedEmail }
        ],
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
      throw new Error('User not found with this email.');
    }

    // Filter to active organizations
    const activeOrgUsers = users.filter(u => u.organization?.isActive);
    if (activeOrgUsers.length === 0) {
      throw new Error('Your organization account is inactive. Please contact support.');
    }

    if (activeOrgUsers.length === 1) {
      const u = activeOrgUsers[0]!;
      return {
        singleOrganization: true,
        organization: {
          orgId: u.organization.id,
          orgName: u.organization.name,
          userId: u.id,
          userStatus: u.status
        },
        message: 'Single organization found'
      };
    }

    return {
      singleOrganization: false,
      multipleOrganizations: true,
      organizations: activeOrgUsers.map(u => ({
        orgId: u.organization.id,
        orgName: u.organization.name,
        userId: u.id,
        userStatus: u.status
      })),
      message: 'Multiple organizations found. Please select one.'
    };
  }

  // Password verification and login
  static async verifyPassword(
    email: string,
    password: string,
    orgId?: string
  ): Promise<{ response: LoginSuccessResponse | LoginOtpRequiredResponse; tokens?: TokenPair }> {
    const normalizedEmail = email.toLowerCase().trim();

    // 1. SuperAdmin authentication
    const superAdmin = await prisma.superAdmin.findFirst({
      where: { email: normalizedEmail }
    });

    if (superAdmin) {
      const isValid = await bcrypt.compare(password, superAdmin.hashedPassword);
      if (!isValid) {
        throw new Error('Invalid email or password.');
      }

      const tokens = this.generateSuperAdminTokens({
        id: superAdmin.id,
        email: superAdmin.email
      });

      await prisma.superAdmin.update({
        where: { id: superAdmin.id },
        data: { refreshToken: tokens.refreshToken }
      });

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
            status: 'active'
          }
        }
      };
    }

    // 2. Organization User authentication
    const userQuery: any = {
      OR: [
        { email: normalizedEmail },
        { businessEmail: normalizedEmail },
        { personalEmail: normalizedEmail }
      ]
    };

    if (orgId) {
      userQuery.orgId = orgId;
    }

    const user = await prisma.user.findFirst({
      where: userQuery,
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

    if (!user || !user.hashedPassword) {
      throw new Error('Invalid email or password.');
    }

    if (!user.organization?.isActive) {
      throw new Error('Organization account is inactive.');
    }

    if (user.status === 'suspended') {
      throw new Error('User is suspended.');
    }

    if (user.status === 'inactive') {
      throw new Error('User is inactive.');
    }

    const isValid = await bcrypt.compare(password, user.hashedPassword);
    if (!isValid) {
      throw new Error('Invalid email or password.');
    }

    // If 2FA is required
    if (user.twoFactorEnabled) {
      // Cryptographically secure 6-digit OTP (fixes SEC-008, SEC-010)
      const otpCode = crypto.randomInt(100000, 1000000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await prisma.emailOtpVerification.create({
        data: {
          userId: user.id,
          otpCode,
          purpose: 'LOGIN',
          expiresAt,
          isUsed: false,
          attemptsCount: 0,
          maxAttempts: 3
        }
      });

      logger.info({ userId: user.id }, 'Generated secure OTP for 2FA login');

      return {
        response: {
          message: 'Two-factor OTP required',
          requiresTwoFactor: true,
          userId: user.id,
          email: user.email
        }
      };
    }

    // Standard login (2FA disabled by default)
    const tokens = this.generateUserTokens({
      id: user.id,
      email: user.email,
      orgId: user.orgId
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken }
    });

    const roles: string[] = [];
    const permissions: string[] = [];
    for (const ur of user.roles) {
      if (ur.role?.name) roles.push(ur.role.name);
      for (const p of ur.role?.permissions || []) {
        if (p.permission?.key) permissions.push(p.permission.key);
      }
    }

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
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
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
  }): Promise<{ response: LoginSuccessResponse; tokens: TokenPair }> {
    const { email, sessionToken, otpCode, orgId } = params;

    let targetUserId: string | null = null;

    if (sessionToken) {
      const session = await prisma.tempLoginSession.findFirst({
        where: {
          sessionToken,
          expiresAt: { gt: new Date() },
          isUsed: false
        }
      });
      if (!session) {
        throw new Error('Invalid or expired login session.');
      }
      targetUserId = session.userId;
      await prisma.tempLoginSession.update({
        where: { id: session.id },
        data: { isUsed: true }
      });
    } else if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: normalizedEmail },
            { businessEmail: normalizedEmail },
            { personalEmail: normalizedEmail }
          ],
          ...(orgId ? { orgId } : {})
        }
      });
      if (!user) {
        throw new Error('User not found.');
      }
      targetUserId = user.id;
    }

    if (!targetUserId) {
      throw new Error('Unable to identify user for OTP verification.');
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
      throw new Error('Invalid or expired OTP.');
    }

    if (otpRecord.attemptsCount >= otpRecord.maxAttempts) {
      await prisma.emailOtpVerification.update({
        where: { id: otpRecord.id },
        data: { isUsed: true }
      });
      throw new Error('Maximum OTP attempts exceeded. Please request a new code.');
    }

    if (otpRecord.otpCode !== otpCode) {
      await prisma.emailOtpVerification.update({
        where: { id: otpRecord.id },
        data: { attemptsCount: otpRecord.attemptsCount + 1 }
      });
      throw new Error('Invalid OTP code.');
    }

    // Mark OTP as used
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

    if (!user || !user.organization?.isActive) {
      throw new Error('User account or organization is inactive.');
    }

    const tokens = this.generateUserTokens({
      id: user.id,
      email: user.email,
      orgId: user.orgId
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken }
    });

    const roles: string[] = [];
    const permissions: string[] = [];
    for (const ur of user.roles) {
      if (ur.role?.name) roles.push(ur.role.name);
      for (const p of ur.role?.permissions || []) {
        if (p.permission?.key) permissions.push(p.permission.key);
      }
    }

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
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
          orgId: user.orgId,
          roles,
          permissions,
          status: user.status
        }
      }
    };
  }

  // Secure Password Setup (Fixes SEC-005: rejects null token, invalidates token after use, no password leakage)
  static async setPassword(password: string, verificationToken: string): Promise<UserSummaryDTO> {
    if (!verificationToken || typeof verificationToken !== 'string' || verificationToken.trim() === '') {
      throw new Error('A valid verification token must be provided.');
    }

    const user = await prisma.user.findFirst({
      where: {
        verificationToken: verificationToken.trim()
      }
    });

    if (!user) {
      throw new Error('Invalid or expired verification token.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Invalidate token so it can NEVER be reused (replay protection)
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        hashedPassword,
        status: 'active',
        verificationToken: null // Token cleared!
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

    logger.info({ userId: updatedUser.id }, 'Password set and verification token invalidated successfully');

    return {
      ...updatedUser,
      name: `${updatedUser.firstName || ''} ${updatedUser.lastName || ''}`.trim() || updatedUser.email
    };
  }

  // Refresh token rotation
  static async refreshToken(incomingRefreshToken: string): Promise<TokenPair> {
    // 1. Try SuperAdmin token
    try {
      const decoded = jwt.verify(
        incomingRefreshToken,
        env.SUPER_ADMIN_REFRESH_TOKEN_SECRET
      ) as DecodedTokenPayload;

      if (decoded.typ === 'super_admin') {
        const superAdmin = await prisma.superAdmin.findUnique({
          where: { id: decoded.id }
        });

        if (!superAdmin || superAdmin.refreshToken !== incomingRefreshToken) {
          throw new Error('Invalid super-admin refresh token.');
        }

        const newTokens = this.generateSuperAdminTokens({
          id: superAdmin.id,
          email: superAdmin.email
        });

        await prisma.superAdmin.update({
          where: { id: superAdmin.id },
          data: { refreshToken: newTokens.refreshToken }
        });

        return newTokens;
      }
    } catch {
      // Fall through to check user token
    }

    // 2. Try Organization User token
    try {
      const decoded = jwt.verify(
        incomingRefreshToken,
        env.USER_REFRESH_TOKEN_SECRET
      ) as DecodedTokenPayload;

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        include: {
          organization: { select: { isActive: true } }
        }
      });

      if (!user || user.refreshToken !== incomingRefreshToken) {
        throw new Error('Invalid user refresh token.');
      }

      if (user.status !== 'active' || !user.organization?.isActive) {
        throw new Error('Account or organization is inactive.');
      }

      const newTokens = this.generateUserTokens({
        id: user.id,
        email: user.email,
        orgId: user.orgId
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: newTokens.refreshToken }
      });

      return newTokens;
    } catch (err: any) {
      throw new Error(err.message || 'Invalid or expired refresh token.');
    }
  }

  // Logout - clear tokens
  static async logout(userId: string, isSuperAdmin = false): Promise<void> {
    if (isSuperAdmin) {
      await prisma.superAdmin.updateMany({
        where: { id: userId },
        data: { refreshToken: null }
      });
    } else {
      await prisma.user.updateMany({
        where: { id: userId },
        data: { refreshToken: null }
      });
    }
  }

  // Get full user profile for token validation
  static async getUserProfile(userId: string, orgId?: string, isSuperAdmin = false): Promise<any> {
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
        throw new Error('Super-admin not found.');
      }

      return {
        id: superAdmin.id,
        email: superAdmin.email,
        name: superAdmin.name,
        superAdmin: true,
        isSuperAdmin: true,
        organization: {
          id: 'platform-superadmin',
          name: 'Platform Administration'
        }
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
      throw new Error('User not found.');
    }

    if (user.status !== 'active') {
      throw new Error('User account is inactive.');
    }

    if (!user.organization?.isActive) {
      throw new Error('Organization is inactive.');
    }

    const roles: string[] = [];
    const permissions: string[] = [];
    for (const ur of user.roles) {
      if (ur.role?.name) roles.push(ur.role.name);
      for (const p of ur.role?.permissions || []) {
        if (p.permission?.key) permissions.push(p.permission.key);
      }
    }

    return {
      ...user,
      roles,
      permissions
    };
  }
}
