export interface AuthenticatedUser {
  id: string;
  email: string;
  employeeId?: string;
  orgId?: string;
  firstName?: string | null;
  lastName?: string | null;
  roles: string[];
  permissions: string[];
  isSuperAdmin: boolean;
}

export interface AuthenticatedSuperAdmin {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: true;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      superAdmin?: AuthenticatedSuperAdmin;
    }
  }
}
