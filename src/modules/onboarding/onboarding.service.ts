import crypto from 'crypto';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import { hashPassword } from '../../util/password.js';
import { EmailService } from '../../services/email.service.js';

export interface CreateCandidateInput {
  email: string;
  personalEmail?: string | null;
  businessEmail?: string | null;
  firstName: string;
  lastName?: string;
  mobileNumber?: string | null;
  jobTitle?: string | null;
  departmentId?: string | null;
  managerId?: string | null;
  annualPackage?: number | null;
  monthlySalary?: number | null;
  hiredDate?: string | null;
}

export interface CompleteOnboardingInput {
  roleId: string;
  departmentId?: string | null;
  managerId?: string | null;
  businessEmail?: string | null;
  jobTitle?: string | null;
  annualPackage?: number | null;
  monthlySalary?: number | null;
}

export class OnboardingService {
  static async listCandidates(orgId: string, status?: string) {
    const where: any = { orgId };
    if (status && status !== 'ALL') {
      where.status = status;
    }

    return prisma.onboardingCandidate.findMany({
      where,
      include: {
        department: { select: { id: true, name: true } },
        manager: { select: { id: true, firstName: true, lastName: true, email: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  static async getCandidateById(orgId: string, id: string) {
    const candidate = await prisma.onboardingCandidate.findFirst({
      where: { id, orgId },
      include: {
        department: true,
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            businessEmail: true,
            jobTitle: true
          }
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        reviewedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        organization: {
          select: {
            id: true,
            name: true,
            logo: true
          }
        }
      }
    });

    if (!candidate) {
      throw new AppError('Candidate not found in your organization.', 404, 'CANDIDATE_NOT_FOUND');
    }

    return candidate;
  }

  static async createCandidate(orgId: string, createdById: string, input: CreateCandidateInput) {
    const actor = await prisma.user.findFirst({
      where: { id: createdById, orgId },
      select: { id: true }
    });

    let effectiveCreatedById = actor?.id;
    if (!effectiveCreatedById) {
      const orgAdmin = await prisma.organization_admin.findFirst({
        where: { orgId },
        select: { adminId: true }
      });
      effectiveCreatedById =
        orgAdmin?.adminId ??
        (
          await prisma.user.findFirst({
            where: { orgId },
            select: { id: true }
          })
        )?.id;
    }

    if (!effectiveCreatedById) {
      throw new AppError(
        'Organization has no user available to own the onboarding record.',
        400,
        'ONBOARDING_OWNER_MISSING'
      );
    }

    const email = input.email.toLowerCase().trim();

    // Check if user already exists in organization
    const existingUser = await prisma.user.findFirst({
      where: { orgId, email }
    });
    if (existingUser) {
      throw new AppError('An active user with this email already exists in your organization.', 409, 'USER_EXISTS');
    }

    // Check if candidate already exists
    const existingCandidate = await prisma.onboardingCandidate.findFirst({
      where: { email }
    });
    if (existingCandidate) {
      throw new AppError('An onboarding candidate with this email already exists.', 409, 'CANDIDATE_EXISTS');
    }

    // Validate department if provided
    if (input.departmentId) {
      const dept = await prisma.department.findFirst({ where: { id: input.departmentId, orgId } });
      if (!dept) throw new AppError('Department not found in your organization.', 400, 'INVALID_DEPARTMENT');
    }

    // Validate manager if provided
    if (input.managerId) {
      const mgr = await prisma.user.findFirst({ where: { id: input.managerId, orgId } });
      if (!mgr) throw new AppError('Reporting manager not found in your organization.', 400, 'INVALID_MANAGER');
    }

    // Calculate salaries
    const annualPackage = input.annualPackage || (input.monthlySalary ? input.monthlySalary * 12 : null);
    const monthlySalary = input.monthlySalary || (input.annualPackage ? Math.round(input.annualPackage / 12) : null);

    // Cryptographically secure token (32 bytes = 64 hex chars)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

    const candidate = await prisma.onboardingCandidate.create({
      data: {
        orgId,
        createdById: effectiveCreatedById,
        email,
        personalEmail: input.personalEmail || email,
        businessEmail: input.businessEmail || null,
        firstName: input.firstName,
        lastName: input.lastName || '',
        mobileNumber: input.mobileNumber || null,
        departmentId: input.departmentId || null,
        managerId: input.managerId || null,
        annualPackage,
        monthlySalary,
        hiredDate: input.hiredDate ? new Date(input.hiredDate) : null,
        status: 'INVITED',
        verificationToken,
        tokenExpiry,
        formData: {
          jobTitle: input.jobTitle || null
        }
      },
      include: {
        department: true,
        manager: true,
        organization: {
          select: { id: true, name: true }
        }
      }
    });

    EmailService.sendCandidateInviteEmail({
      email: candidate.personalEmail || candidate.email,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      companyName: candidate.organization.name,
      token: candidate.verificationToken!,
      jobTitle: (candidate.formData as any)?.jobTitle || null
    }).catch(() => {});

    return candidate;
  }

  static async sendInvitation(orgId: string, id: string) {
    const candidate = await this.getCandidateById(orgId, id);

    let token = candidate.verificationToken;
    let tokenExpiry = candidate.tokenExpiry;

    if (!token || (tokenExpiry && tokenExpiry < new Date())) {
      token = crypto.randomBytes(32).toString('hex');
      tokenExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      await prisma.onboardingCandidate.update({
        where: { id: candidate.id },
        data: { verificationToken: token, tokenExpiry }
      });
    }

    const sent = await EmailService.sendCandidateInviteEmail({
      email: candidate.personalEmail || candidate.email,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      companyName: candidate.organization.name,
      token,
      jobTitle: (candidate.formData as any)?.jobTitle || null
    });

    return {
      message: sent
        ? 'Invitation sent successfully'
        : 'Invitation email could not be dispatched because the email service is unavailable',
      sent
    };
  }

  // Public candidate self-service endpoint: verify token
  static async verifyCandidateToken(token: string) {
    const candidate = await prisma.onboardingCandidate.findFirst({
      where: { verificationToken: token },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            logo: true
          }
        },
        department: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!candidate) {
      throw new AppError('Invalid or expired onboarding invitation link.', 404, 'INVALID_TOKEN');
    }

    if (candidate.tokenExpiry && candidate.tokenExpiry < new Date()) {
      throw new AppError('Onboarding invitation has expired. Please contact HR.', 410, 'TOKEN_EXPIRED');
    }

    if (candidate.status === 'ONBOARDED') {
      throw new AppError('Onboarding has already been completed for this candidate.', 400, 'ALREADY_ONBOARDED');
    }

    return {
      id: candidate.id,
      email: candidate.email,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      mobileNumber: candidate.mobileNumber,
      status: candidate.status,
      formData: candidate.formData,
      organization: candidate.organization,
      department: candidate.department
    };
  }

  // Public candidate self-service endpoint: submit form
  static async submitCandidateForm(token: string, formData: any) {
    const candidate = await prisma.onboardingCandidate.findFirst({
      where: { verificationToken: token }
    });

    if (!candidate) {
      throw new AppError('Invalid onboarding invitation link.', 404, 'INVALID_TOKEN');
    }

    if (candidate.status === 'ONBOARDED') {
      throw new AppError('Onboarding has already been completed.', 400, 'ALREADY_ONBOARDED');
    }

    // Merge existing formData with new submissions
    const existingData = (candidate.formData as any) || {};
    const mergedData = {
      ...existingData,
      ...formData,
      submittedAt: new Date().toISOString()
    };

    return prisma.onboardingCandidate.update({
      where: { id: candidate.id },
      data: {
        formData: mergedData,
        formSubmittedAt: new Date(),
        status: 'FORM_SUBMITTED',
        firstName: formData.firstName || candidate.firstName,
        lastName: formData.lastName !== undefined ? formData.lastName : candidate.lastName,
        mobileNumber: formData.mobileNumber || candidate.mobileNumber
      }
    });
  }

  static async markUnderReview(orgId: string, id: string, reviewerId: string) {
    const candidate = await this.getCandidateById(orgId, id);

    return prisma.onboardingCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'UNDER_REVIEW',
        reviewedById: reviewerId,
        reviewedAt: new Date()
      }
    });
  }

  static async verifyDocument(orgId: string, id: string, reviewerId: string, docKey: string, status: 'VERIFIED' | 'REJECTED', feedback?: string) {
    const candidate = await this.getCandidateById(orgId, id);

    const formData = (candidate.formData as any) || {};
    const documentsAudit = formData.documentsAudit || {};

    documentsAudit[docKey] = {
      status,
      feedback: feedback || null,
      reviewedById: reviewerId,
      reviewedAt: new Date().toISOString()
    };

    formData.documentsAudit = documentsAudit;

    return prisma.onboardingCandidate.update({
      where: { id: candidate.id },
      data: {
        formData
      }
    });
  }

  static async approveCandidate(orgId: string, id: string, reviewerId: string, approvalData: any = {}) {
    const candidate = await this.getCandidateById(orgId, id);

    const formData = (candidate.formData as any) || {};
    formData.approvalData = {
      ...formData.approvalData,
      ...approvalData,
      approvedAt: new Date().toISOString(),
      approvedBy: reviewerId
    };

    const updated = await prisma.onboardingCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'APPROVED',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        formData
      },
      include: {
        organization: true,
        department: true
      }
    });

    // Dispatch approval email to candidate
    EmailService.sendCandidateApprovedEmail({
      email: candidate.personalEmail || candidate.email,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      companyName: candidate.organization.name,
      jobTitle: approvalData.jobTitle || (formData.jobTitle as string) || null
    }).catch(() => {});

    return updated;
  }

  static async rejectCandidate(orgId: string, id: string, reviewerId: string, reason: string) {
    const candidate = await this.getCandidateById(orgId, id);

    return prisma.onboardingCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
        reviewedById: reviewerId,
        reviewedAt: new Date()
      }
    });
  }

  static async completeOnboarding(orgId: string, id: string, input: CompleteOnboardingInput) {
    const candidate = await this.getCandidateById(orgId, id);

    if (candidate.status !== 'APPROVED') {
      throw new AppError('Candidate must be APPROVED before completing onboarding.', 400, 'NOT_APPROVED');
    }

    const formData = (candidate.formData as any) || {};
    const approvalData = formData.approvalData || {};

    const departmentId = input.departmentId || approvalData.departmentId || candidate.departmentId;
    const managerId = input.managerId || approvalData.managerId || candidate.managerId;
    const roleId = input.roleId || approvalData.roleId;

    if (!roleId) {
      throw new AppError('Role ID is required to provision the employee.', 400, 'ROLE_REQUIRED');
    }

    // Validate role exists in org
    const role = await prisma.role.findFirst({ where: { id: roleId, orgId } });
    if (!role) {
      throw new AppError('Designated role not found in organization.', 400, 'INVALID_ROLE');
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        orgId,
        email: candidate.email
      }
    });
    if (existingUser) {
      throw new AppError('An employee with this email already exists in your organization.', 409, 'USER_EXISTS');
    }

    // Generate unique employee ID
    const organization = candidate.organization;
    const orgPrefix = organization.name
      .split(' ')
      .map((w) => w.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 4) || 'EMP';

    const now = new Date();
    const yearMonth = now.getFullYear().toString().slice(-2) + (now.getMonth() + 1).toString().padStart(2, '0');
    let counter = 1;
    let employeeId = `${orgPrefix}${yearMonth}${counter.toString().padStart(3, '0')}`;
    while (await prisma.user.findFirst({ where: { orgId, employeeId } })) {
      counter++;
      employeeId = `${orgPrefix}${yearMonth}${counter.toString().padStart(3, '0')}`;
    }

    const tempPassword = crypto.randomBytes(8).toString('hex') + 'A1!';
    const hashedPassword = await hashPassword(tempPassword);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const annualPackage = input.annualPackage || approvalData.annualPackage || candidate.annualPackage || 0;
    const monthlySalary = input.monthlySalary || approvalData.monthlySalary || candidate.monthlySalary || (annualPackage ? Math.round(annualPackage / 12) : 0);

    const bank = formData.bankDetails;

    // Transactional provisioning
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          orgId,
          firstName: formData.firstName || candidate.firstName,
          lastName: formData.lastName || candidate.lastName || '',
          email: input.businessEmail || candidate.businessEmail || candidate.email,
          personalEmail: candidate.email,
          businessEmail: input.businessEmail || candidate.businessEmail || null,
          jobTitle: input.jobTitle || formData.jobTitle || null,
          mobileNumber: formData.mobileNumber || candidate.mobileNumber,
          dateOfBirth: formData.dateOfBirth ? new Date(formData.dateOfBirth) : null,
          hiredDate: candidate.hiredDate || new Date(),
          address: formData.address || null,
          adharNumber: formData.adharNumber || null,
          panNumber: formData.panNumber || null,
          emergencyContact: formData.emergencyContact || null,
          employeeId,
          departmentId: departmentId || null,
          managerId: managerId || null,
          hashedPassword,
          verificationToken,
          status: 'active',
          annualPackage,
          monthlySalary,
          roles: {
            create: [{ role: { connect: { id: roleId } } }]
          },
          ...(bank?.accountNumber && bank?.ifscCode
            ? {
                bankDetails: {
                  create: {
                    accountHolder: bank.accountHolderName || `${candidate.firstName} ${candidate.lastName || ''}`.trim(),
                    accountNumber: bank.accountNumber,
                    ifscCode: bank.ifscCode,
                    bankName: bank.bankName || 'Bank'
                  }
                }
              }
            : {}),
          ...(annualPackage > 0
            ? {
                salaryParameter: {
                  create: {
                    hraPercentage: 40,
                    daPercentage: 10,
                    taPercentage: 10,
                    pfPercentage: 12,
                    taxPercentage: 10,
                    insuranceFixed: 1000
                  }
                }
              }
            : {})
        },
        include: {
          department: true,
          roles: { include: { role: true } },
          bankDetails: true,
          salaryParameter: true
        }
      });

      // Seed leave balances
      const leaveTypes = await tx.leaveType.findMany({ where: { orgId } });
      if (leaveTypes.length > 0) {
        await tx.leaveBalance.createMany({
          data: leaveTypes.map((lt) => ({
            userId: createdUser.id,
            leaveTypeId: lt.id,
            usedDays: 0,
            remainingDays: lt.annualLimit,
            year: new Date().getFullYear()
          }))
        });
      }

      // Mark candidate as ONBOARDED
      await tx.onboardingCandidate.update({
        where: { id: candidate.id },
        data: { status: 'ONBOARDED' }
      });

      return createdUser;
    });

    const { hashedPassword: _p, ...safeUser } = user;

    // Dispatch official account credentials email to employee
    EmailService.sendNewEmployeeWelcomeEmail({
      email: safeUser.email,
      name: `${safeUser.firstName} ${safeUser.lastName || ''}`.trim(),
      employeeId,
      temporaryPassword: tempPassword,
      companyName: candidate.organization.name
    }).catch(() => {});

    return {
      message: 'Onboarding completed and employee successfully provisioned',
      user: safeUser,
      employeeId,
      temporaryPassword: tempPassword,
      verificationToken
    };
  }

  static async getCandidateReviewData(orgId: string, id: string) {
    const candidate = await this.getCandidateById(orgId, id);
    const formData = (candidate.formData as any) || {};

    return {
      data: {
        candidateInfo: {
          id: candidate.id,
          email: candidate.email,
          personalEmail: candidate.personalEmail || candidate.email,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          mobileNumber: candidate.mobileNumber,
          status: candidate.status,
          createdAt: candidate.createdAt,
          formSubmittedAt: candidate.formSubmittedAt
        },
        initialData: {
          annualPackage: candidate.annualPackage,
          hiredDate: candidate.hiredDate,
          departmentId: candidate.departmentId,
          department: candidate.department
        },
        submittedData: {
          personalInfo: {
            firstName: formData.firstName || candidate.firstName,
            lastName: formData.lastName || candidate.lastName,
            mobileNumber: formData.mobileNumber || candidate.mobileNumber,
            emergencyContact: formData.emergencyContact,
            dateOfBirth: formData.dateOfBirth,
            address: formData.address,
            adharNumber: formData.adharNumber,
            panNumber: formData.panNumber
          },
          bankDetails: formData.bankDetails || {},
          documents: formData.documents || {},
          additionalInfo: formData.additionalInfo || {}
        },
        reviewHistory: {
          reviewedBy: candidate.reviewedBy,
          reviewedAt: candidate.reviewedAt,
          rejectionReason: candidate.rejectionReason
        },
        metadata: {
          createdBy: candidate.createdBy,
          organization: candidate.organization,
          tokenExpiry: candidate.tokenExpiry,
          hasToken: !!candidate.verificationToken
        }
      }
    };
  }

  static async updateCandidateData(orgId: string, id: string, data: any) {
    const candidate = await this.getCandidateById(orgId, id);
    const existingFormData = (candidate.formData as any) || {};

    const updatedFormData = {
      ...existingFormData,
      ...data,
      bankDetails: {
        ...(existingFormData.bankDetails || {}),
        accountHolderName: data.accountHolderName || existingFormData.bankDetails?.accountHolderName,
        accountNumber: data.bankAccountNumber || data.accountNumber || existingFormData.bankDetails?.accountNumber,
        ifscCode: data.bankIFSC || data.ifscCode || existingFormData.bankDetails?.ifscCode,
        bankName: data.bankName || existingFormData.bankDetails?.bankName
      }
    };

    return prisma.onboardingCandidate.update({
      where: { id: candidate.id },
      data: {
        firstName: data.firstName || candidate.firstName,
        lastName: data.lastName !== undefined ? data.lastName : candidate.lastName,
        personalEmail: data.personalEmail || data.email || candidate.personalEmail,
        mobileNumber: data.mobileNumber || candidate.mobileNumber,
        departmentId: data.departmentId !== undefined ? data.departmentId : candidate.departmentId,
        annualPackage: data.annualPackage !== undefined ? Number(data.annualPackage) : candidate.annualPackage,
        hiredDate: data.hiredDate ? new Date(data.hiredDate) : candidate.hiredDate,
        formData: updatedFormData
      },
      include: {
        department: true,
        manager: true
      }
    });
  }

  static async requestChanges(orgId: string, id: string, reviewerId: string, feedback: string) {
    const candidate = await this.getCandidateById(orgId, id);
    const formData = (candidate.formData as any) || {};

    formData.changeRequests = formData.changeRequests || [];
    formData.changeRequests.push({
      feedback,
      requestedAt: new Date().toISOString(),
      requestedBy: reviewerId
    });

    return prisma.onboardingCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'UNDER_REVIEW',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        formData
      }
    });
  }

  static async deleteCandidate(orgId: string, id: string) {
    const candidate = await this.getCandidateById(orgId, id);

    await prisma.onboardingCandidate.delete({
      where: { id: candidate.id }
    });

    return { message: 'Candidate deleted successfully' };
  }
}
