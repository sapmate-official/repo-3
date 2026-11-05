export interface CheckEmailResponse {
  singleOrganization: boolean;
  multipleOrganizations?: boolean;
  organizations?: Array<{
    orgId: string;
    orgName: string;
    userId: string;
    userStatus: string;
  }>;
  organization?: {
    orgId: string;
    orgName: string;
    userId: string;
    userStatus?: string;
  };
  message: string;
}

export interface UserSummaryDTO {
  id: string;
  email: string;
  businessEmail?: string | null;
  personalEmail?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  orgId?: string;
  roles?: string[];
  permissions?: string[];
  status?: string;
  isSuperAdmin?: boolean;
  superAdmin?: boolean;
}

export interface LoginSuccessResponse {
  message: string;
  accessToken: string;
  refreshToken?: string;
  organization?: {
    id: string;
    name: string;
  };
  user: UserSummaryDTO;
  requiresTwoFactor?: false;
}

export interface LoginOtpRequiredResponse {
  message: string;
  requiresTwoFactor: true;
  userId: string;
  email: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
