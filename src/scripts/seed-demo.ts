import bcrypt from 'bcrypt';
import prisma from '../db/prisma.js';

const DEMO_ORG_NAME = 'Alkaa Demo';
const SUPER_ADMIN = {
  email: 'superadmin-test@alkaa.online',
  password: 'superAdmin-test@2025',
  name: 'Test Super Admin'
};
const USER_PASSWORD = 'Alkaa@Test2025!';

interface RoleSpec {
  name: string;
  description: string;
  email: string;
  firstName: string;
  lastName: string;
  categories: string[];
  userOnly?: boolean;
  isOrgAdmin?: boolean;
}

const ROLE_SPECS: RoleSpec[] = [
  {
    name: 'Org_Admin',
    description: 'Organization administrator',
    email: 'admin@alkaa.test',
    firstName: 'Org',
    lastName: 'Admin',
    categories: ['all'],
    isOrgAdmin: true
  },
  {
    name: 'CEO',
    description: 'Chief Executive Officer - Full organizational control',
    email: 'ceo@alkaa.test',
    firstName: 'Chandra',
    lastName: 'Executive',
    categories: ['all']
  },
  {
    name: 'CTO',
    description: 'Chief Technology Officer - Technology leadership',
    email: 'cto@alkaa.test',
    firstName: 'Tara',
    lastName: 'Technology',
    categories: ['Organization', 'Department', 'Employee', 'Info', 'Role']
  },
  {
    name: 'HR Director',
    description: 'Human Resources Director - People management',
    email: 'hr.director@alkaa.test',
    firstName: 'Hema',
    lastName: 'Director',
    categories: ['Employee', 'Info', 'Organization', 'Salary']
  },
  {
    name: 'Engineering Manager',
    description: 'Engineering team leadership and management',
    email: 'engineering.manager@alkaa.test',
    firstName: 'Eshan',
    lastName: 'Manager',
    categories: ['Department', 'Employee', 'Info', 'Attendance']
  },
  {
    name: 'Senior Software Engineer',
    description: 'Senior technical contributor and team lead',
    email: 'senior.engineer@alkaa.test',
    firstName: 'Sana',
    lastName: 'Engineer',
    categories: ['Info', 'Attendance', 'leave'],
    userOnly: true
  },
  {
    name: 'Software Engineer',
    description: 'Software development and implementation',
    email: 'engineer@alkaa.test',
    firstName: 'Sam',
    lastName: 'Engineer',
    categories: ['Info', 'Attendance', 'leave'],
    userOnly: true
  },
  {
    name: 'QA Engineer',
    description: 'Quality assurance and testing specialist',
    email: 'qa@alkaa.test',
    firstName: 'Quinn',
    lastName: 'Tester',
    categories: ['Info', 'Attendance', 'leave'],
    userOnly: true
  },
  {
    name: 'DevOps Engineer',
    description: 'Infrastructure and deployment specialist',
    email: 'devops@alkaa.test',
    firstName: 'Dev',
    lastName: 'Ops',
    categories: ['Info', 'Attendance', 'leave'],
    userOnly: true
  },
  {
    name: 'UI/UX Designer',
    description: 'User interface and experience design',
    email: 'designer@alkaa.test',
    firstName: 'Uma',
    lastName: 'Designer',
    categories: ['Info', 'Attendance', 'leave'],
    userOnly: true
  },
  {
    name: 'Sales Manager',
    description: 'Sales team leadership and client management',
    email: 'sales.manager@alkaa.test',
    firstName: 'Sahil',
    lastName: 'Manager',
    categories: ['Info', 'Attendance', 'Organization']
  },
  {
    name: 'Sales Executive',
    description: 'Client acquisition and relationship management',
    email: 'sales@alkaa.test',
    firstName: 'Sara',
    lastName: 'Sales',
    categories: ['Info', 'Attendance', 'leave'],
    userOnly: true
  },
  {
    name: 'Finance Manager',
    description: 'Financial planning and analysis leadership',
    email: 'finance.manager@alkaa.test',
    firstName: 'Farah',
    lastName: 'Manager',
    categories: ['Salary', 'Info', 'Attendance', 'Organization']
  },
  {
    name: 'Accountant',
    description: 'Financial record keeping and reporting',
    email: 'accountant@alkaa.test',
    firstName: 'Aman',
    lastName: 'Accountant',
    categories: ['Info', 'Attendance', 'leave'],
    userOnly: true
  },
  {
    name: 'HR Manager',
    description: 'Human resources management and operations',
    email: 'hr.manager@alkaa.test',
    firstName: 'Hira',
    lastName: 'Manager',
    categories: ['Employee', 'Info', 'Attendance', 'leave']
  },
  {
    name: 'Talent Acquisition Specialist',
    description: 'Recruitment and hiring specialist',
    email: 'recruiter@alkaa.test',
    firstName: 'Tara',
    lastName: 'Recruiter',
    categories: ['Employee', 'Info', 'Attendance']
  },
  {
    name: 'Employee',
    description: 'Standard employee access',
    email: 'employee@alkaa.test',
    firstName: 'Eli',
    lastName: 'Employee',
    categories: ['Info', 'Attendance', 'leave'],
    userOnly: true
  }
];

const loadPermissions = () =>
  prisma.permission.findMany({
    include: {
      subcategory: {
        include: {
          category: true
        }
      }
    }
  });

type PermissionWithParent = Awaited<ReturnType<typeof loadPermissions>>[number];

const permissionsFor = (
  spec: RoleSpec,
  permissions: PermissionWithParent[]
): PermissionWithParent[] => {
  if (spec.categories.includes('all')) {
    return permissions;
  }

  const categories = new Set(spec.categories.map((category) => category.toLowerCase()));

  return permissions.filter((permission) => {
    const category = permission.subcategory?.category.name.toLowerCase();
    if (!category || !categories.has(category)) {
      return false;
    }
    if (!spec.userOnly) {
      return true;
    }
    const subcategory = permission.subcategory?.name.toLowerCase();
    return subcategory === 'user' || subcategory === 'personal';
  });
};

const run = async (): Promise<void> => {
  const superAdminHash = await bcrypt.hash(SUPER_ADMIN.password, 12);
  const userHash = await bcrypt.hash(USER_PASSWORD, 12);
  const permissions = await loadPermissions();

  if (permissions.length === 0) {
    throw new Error('No permissions found. Seed the permission catalog first.');
  }

  await prisma.superAdmin.upsert({
    where: { email: SUPER_ADMIN.email },
    update: {
      name: SUPER_ADMIN.name,
      hashedPassword: superAdminHash
    },
    create: {
      email: SUPER_ADMIN.email,
      name: SUPER_ADMIN.name,
      hashedPassword: superAdminHash
    }
  });

  const existingOrg = await prisma.organization.findFirst({
    where: { name: DEMO_ORG_NAME }
  });

  const organizationData = {
    industry: 'Information Technology',
    address: 'Bengaluru, India',
    timezone: 'Asia/Kolkata',
    subscriptionEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    isActive: true,
    settings: {
      workingHours: '9:00 AM - 6:00 PM',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    }
  };

  const organization = existingOrg
    ? await prisma.organization.update({
        where: { id: existingOrg.id },
        data: organizationData
      })
    : await prisma.organization.create({
        data: {
          name: DEMO_ORG_NAME,
          ...organizationData
        }
      });

  const roleResults: { role: string; email: string; permissions: number }[] = [];

  for (const spec of ROLE_SPECS) {
    const role = await prisma.role.upsert({
      where: { orgId_name: { orgId: organization.id, name: spec.name } },
      update: {
        description: spec.description,
        isDefault: Boolean(spec.isOrgAdmin)
      },
      create: {
        orgId: organization.id,
        name: spec.name,
        description: spec.description,
        isDefault: Boolean(spec.isOrgAdmin)
      }
    });

    const rolePermissions = permissionsFor(spec, permissions);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (rolePermissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: rolePermissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id
        })),
        skipDuplicates: true
      });
    }

    const user = await prisma.user.upsert({
      where: { orgId_email: { orgId: organization.id, email: spec.email } },
      update: {
        hashedPassword: userHash,
        firstName: spec.firstName,
        lastName: spec.lastName,
        jobTitle: spec.name,
        status: 'active',
        refreshToken: null
      },
      create: {
        orgId: organization.id,
        email: spec.email,
        hashedPassword: userHash,
        firstName: spec.firstName,
        lastName: spec.lastName,
        jobTitle: spec.name,
        status: 'active',
        hiredDate: new Date()
      }
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id }
    });

    if (spec.isOrgAdmin) {
      const existingAdmin = await prisma.organization_admin.findFirst({
        where: { orgId: organization.id, adminId: user.id }
      });
      if (!existingAdmin) {
        await prisma.organization_admin.create({
          data: { orgId: organization.id, adminId: user.id }
        });
      }
    }

    roleResults.push({
      role: spec.name,
      email: spec.email,
      permissions: rolePermissions.length
    });
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        superAdmin: {
          email: SUPER_ADMIN.email,
          password: SUPER_ADMIN.password
        },
        organization: {
          id: organization.id,
          name: organization.name
        },
        userPassword: USER_PASSWORD,
        roles: roleResults
      },
      null,
      2
    )}\n`
  );
};

if (process.env.SEED_CONFIRM !== 'SEED_DEMO') {
  process.stderr.write('Refusing to seed. Set SEED_CONFIRM=SEED_DEMO to continue.\n');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  process.stderr.write('DATABASE_URL is required.\n');
  process.exit(1);
}

const target = new URL(process.env.DATABASE_URL);
process.stdout.write(`Target database: ${target.hostname}${target.pathname}\n`);

try {
  await run();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
