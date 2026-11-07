# Legacy Backend Issues & Security Audit Log (ALKAA)

This document tracks all known **bugs, architectural defects, logic errors, and security vulnerabilities** in the legacy JavaScript backend (`alkaa-backend`), along with their resolution status in the new TypeScript backend (`alkaa-backend-ts`).

---

## 📌 Status Legend
- 🔴 **CRITICAL**: Remote Code Execution, Authentication Bypass, Privilege Escalation, or Full Multi-Tenant Cross-Contamination.
- 🟠 **HIGH**: Data leakage, Unauthorized Data Modification, Missing Authorization checks.
- 🟡 **MEDIUM**: Logic error, unhandled crashes, broken input validation, bad operator precedence.
- 🔵 **LOW**: Dead code, minor route mismatch, code style inconsistency.

---

## 📑 Issue Registry

### Category 1: SuperAdmin Module

#### `ISSUE-SA-001` · Public Unauthenticated SuperAdmin CRUD (Critical Security Vulnerability)
- **Severity**: 🔴 CRITICAL
- **Location**:
  - `alkaa-backend/src/app.js` (Lines 85–100)
  - `alkaa-backend/src/router/v2/child/superAdmin.router.js` (Lines 37–47)
- **Description**:
  In `app.js`, `/super-admin/` is added to `publicRoutes`, which bypasses the global `validateTokenMiddlewear`. In `superAdmin.router.js`, `GET /`, `GET /:id`, `PUT /:id`, `PATCH /:id`, and `DELETE /:id` have no authentication middleware attached.
- **Impact**:
  Any unauthenticated user on the internet can list all SuperAdmin accounts (`GET /api/v2/super-admin/`), read their profile/email, update their hashed passwords (`PUT /api/v2/super-admin/:id`), or permanently delete them (`DELETE /api/v2/super-admin/:id`).
- **Legacy Status**: ⚠️ Open (Vulnerable)
- **TypeScript Backend Status**: 🟡 Guard implemented (now used by organization CRUD); super-admin account CRUD routes are still pending.

---

#### `ISSUE-SA-002` · Flawed `validateSuperAdminTokenMiddleware` & Privilege Escalation
- **Severity**: 🔴 CRITICAL
- **Location**:
  - `alkaa-backend/src/middleware/validateToken.js` (Lines 102–116)
  - `alkaa-backend/src/util/generate.js` (Lines 8–38)
- **Description**:
  1. `validateSuperAdminTokenMiddleware` signs and verifies tokens using the identical `ACCESS_TOKEN_SECRET` as regular users.
  2. The middleware executes `jwt.verify(token)` and sets `req.user = decoded` without verifying whether `decoded.id` exists in the `SuperAdmin` database table or holds SuperAdmin privileges.
  3. `req.cookies.accessToken` crashes with an unhandled `TypeError` when `req.cookies` is undefined.
- **Impact**:
  Any normal employee or tenant manager token is accepted as a SuperAdmin by SuperAdmin billing and statistics endpoints.
- **Legacy Status**: ⚠️ Open (Vulnerable)
- **TypeScript Backend Status**: 🟡 Guard implemented (dedicated typed guard `superAdminAuth.ts`, separate `SUPER_ADMIN_*_TOKEN_SECRET` secrets, and `typ: 'super_admin'` claims; now used by organization CRUD, super-admin account routes still pending).

---

#### `ISSUE-SA-003` · Hardcoded Email Check in SuperAdmin Login
- **Severity**: 🟡 MEDIUM
- **Location**:
  - `alkaa-backend/src/controller/v2/superAdmin/superAdmin.controller.js` (Lines 167–171)
- **Description**:
  Hardcoded condition in login controller:
  ```javascript
  if (email === "superadmin-test@alkaa.com") {
    return res.status(401).send({ message: "Super Admin email is changed to superadmin-test@alkaa.online" });
  }
  ```
- **Impact**:
  Hardcoded development test credentials and email redirection directly in production code.
- **Legacy Status**: ⚠️ Open
- **TypeScript Backend Status**: ✅ Resolved (super-admin login is database-driven via `POST /api/v1/auth/login`; no hardcoded email).

---

#### `ISSUE-SA-004` · Unreachable Duplicate Auth Branch in `app.js`
- **Severity**: 🔵 LOW / DEAD CODE
- **Location**:
  - `alkaa-backend/src/app.js` (Lines 105–111)
- **Description**:
  The `/api/v2/` guard returns `validateTokenMiddlewear(req, res, next)` on line 103, then contains a second `if (isPublicRoute) { ... } else { ... }` block that is unreachable and reimplements the same decision.
- **Impact**:
  Dead code that obscures the real authentication flow and can mislead future changes to public-path exemptions; no direct runtime impact.
- **Legacy Status**: ⚠️ Open
- **TypeScript Backend Status**: ✅ Not present (no equivalent dead branch in `alkaa-backend-ts`).

---

### Category 2: Admin & Organization Module

#### `ISSUE-ORG-001` · Unauthenticated Organization Creation, Mutation, and Deletion
- **Severity**: 🔴 CRITICAL
- **Location**:
  - `alkaa-backend/src/router/v2/child/organization.router.js` (Lines 13–21)
- **Description**:
  The following organization management routes have no authentication middleware:
  - `GET /api/v2/organization/` (lists all organizations)
  - `POST /api/v2/organization/` (creates an organization)
  - `PUT /api/v2/organization/` (updates organization details)
  - `DELETE /api/v2/organization/` (deletes an organization)
- **Impact**:
  Anonymous attackers can dump all tenant organizations, create rogue tenants, or delete existing tenant organizations.
- **Legacy Status**: ⚠️ Open (Vulnerable)
- **TypeScript Backend Status**: ✅ Resolved in Phase 3 (`/api/v1/organization` CRUD is super-admin-only via `authenticateSuperAdmin`; covered by e2e tests).

---

#### `ISSUE-ORG-002` · Unauthenticated Admin Promotion and Revocation
- **Severity**: 🔴 CRITICAL
- **Location**:
  - `alkaa-backend/src/router/v2/child/organization.router.js` (Lines 29–31)
- **Description**:
  1. `POST /api/v2/organization/:id/admins` (`setOrgAdmin`) has no authentication middleware.
  2. `DELETE /api/v2/organization/:id/admins/:adminId` (`removeOrganizationAdmin`) has no authentication middleware.
- **Impact**:
  Anyone can promote arbitrary users to organization admins or revoke existing organization admins without authorization.
- **Legacy Status**: ⚠️ Open (Vulnerable)
- **TypeScript Backend Status**: ✅ Resolved in Phase 3 (promote/revoke require authentication, tenant scope, and `manage_organization`; covered by e2e tests).

---

#### `ISSUE-ORG-003` · Mismatched Request Parameters in `setOrgAdmin`
- **Severity**: 🟡 MEDIUM / LOGIC BUG
- **Location**:
  - `alkaa-backend/src/router/v2/child/organization.router.js` (Line 30)
  - `alkaa-backend/src/controller/v2/organization/organization.controller.js` (Line 320)
- **Description**:
  The route is mapped as `POST /:id/admins`, meaning `orgId` arrives in `req.params.id`. However, the controller extracts `const { orgId, userId } = req.body`. Calling the REST endpoint without redundant body params causes `orgId` to be undefined and always fails with `403: User does not belong to this organization`.
- **Legacy Status**: ⚠️ Open (Buggy endpoint)
- **TypeScript Backend Status**: ✅ Resolved in Phase 3 (`POST /api/v1/organization/:orgId/admins` reads `orgId` from the path and only `userId` from the body, validated with Zod).

---

#### `ISSUE-ORG-004` · Incomplete Admin Revocation (Orphaned Role Grants)
- **Severity**: 🟠 HIGH
- **Location**:
  - `alkaa-backend/src/controller/v2/organization/organization.controller.js` (Lines 390–415)
- **Description**:
  `removeOrganizationAdmin` deletes the record from `organization_admin`, but leaves the corresponding `UserRole` (`Org_Admin`) in the `UserRole` table untouched.
- **Impact**:
  The user continues to retain `Org_Admin` permissions on all routes checking `UserRole`.
- **Legacy Status**: ⚠️ Open
- **TypeScript Backend Status**: ✅ Resolved in Phase 3 (`removeAdmin` revokes `organization_admin` and the `Org_Admin` `UserRole` in one transaction; covered by e2e tests).

---

### Category 3: Employee & Multi-Tenant Isolation

#### `ISSUE-EMP-001` · Cross-Tenant Employee Data Leakage (Zero Organization Scoping)
- **Severity**: 🔴 CRITICAL
- **Location**:
  - `alkaa-backend/src/controller/v2/organization/Employee/employee.queries.js` (Lines 26–64)
  - `alkaa-backend/src/controller/v2/user/User.controller.js` (Lines 51–58)
- **Description**:
  `listOfEmployees` accepts `orgId` directly from `req.params.orgId`. `getUser` accepts `orgId` from `req.query.orgId || req.params.orgId`. Neither function validates whether `orgId === req.user.orgId`.
- **Impact**:
  An employee from Company A can query the full employee roster, personal emails, phone numbers, salary details, and bank account details of Company B.
- **Legacy Status**: ⚠️ Open (Vulnerable)
- **TypeScript Backend Status**: 🟡 Guard wired for organization admin routes; employee endpoints are not ported yet.

---

#### `ISSUE-EMP-002` · Global Cross-Tenant Leave Data Leakage & Manipulation
- **Severity**: 🔴 CRITICAL
- **Location**:
  - `alkaa-backend/src/controller/v1/manager/manager.controller.js` (Lines 31–62)
- **Description**:
  The `listOfLeave` endpoint queries:
  ```javascript
  const leaves = await prisma.leaveRequest.findMany({
    where: { status: "PENDING" }
  });
  ```
  It applies **zero organization filter** and **zero manager filter**.
- **Impact**:
  Any manager from any organization can see all pending leave requests from every other organization on the platform, and can approve or reject them.
- **Legacy Status**: ⚠️ Open (Vulnerable)
- **TypeScript Backend Status**: ⏳ To be implemented in Phase 5 with strict tenant and department/manager scoping.

---

#### `ISSUE-EMP-003` · Global Leave Type Creation Contaminates All Tenants
- **Severity**: 🟠 HIGH
- **Location**:
  - `alkaa-backend/src/controller/v1/manager/manager.controller.js` (Lines 121–155)
- **Description**:
  In `leaveTypeCreate`, creating a leave type queries all users with `where: { role: "EMPLOYEE" }` globally and iterates across them to create `leaveRecord` rows. It does not scope by `orgId`.
- **Impact**:
  Creating a leave type in one organization pollutes the leave records of every employee in every organization in the database.
- **Legacy Status**: ⚠️ Open
- **TypeScript Backend Status**: ⏳ To be implemented in Phase 5.

---

#### `ISSUE-EMP-004` · Unmounted Employee Router in `v2`
- **Severity**: 🟡 MEDIUM / ROUTING DEFECT
- **Location**:
  - `alkaa-backend/src/router/v2/child/employee.router.js`
  - `alkaa-backend/src/router/v2/main.router.js`
- **Description**:
  `employee.router.js` was created for `v2` but omitted from `main.router.js`. Instead, it was secretly mounted under `organization.router.js` (`/api/v2/organization/employees/`), causing confusing route structures and missing middleware.
- **Legacy Status**: ⚠️ Open
- **TypeScript Backend Status**: ⏳ Not yet ported (`src/routes/v1.ts` currently mounts only the auth module; no employee router exists).

---

#### `ISSUE-EMP-005` · Broken Operator Precedence in Employee Creation Validation
- **Severity**: 🟡 MEDIUM / LOGIC BUG
- **Location**:
  - `alkaa-backend/src/controller/v2/organization/Employee/employee.mutations.js` (Line 73)
- **Description**:
  ```javascript
  if (!firstName || !lastName || ... || !roleIds.length > 0)
  ```
  Due to JavaScript operator precedence, `!roleIds.length` is evaluated before `> 0`.
  - When `roleIds` is `[]`: `!0` is `true`, `true > 0` is `true`.
  - When `roleIds` has 1 item: `!1` is `false`, `false > 0` is `false`.
- **Impact**:
  Causes inverted validation behavior for role assignments.
- **Legacy Status**: ⚠️ Open
- **TypeScript Backend Status**: ⏳ Not yet ported (no employee validation schema exists in `alkaa-backend-ts`).

---

#### `ISSUE-EMP-006` · Insecure and Broken `v1` Employee/Manager Registration
- **Severity**: 🟠 HIGH
- **Location**:
  - `alkaa-backend/src/controller/v1/employee/employee.controller.js` (Lines 5–30)
  - `alkaa-backend/src/controller/v1/manager/manager.controller.js` (Lines 5–30)
- **Description**:
  1. Default passwords hardcoded to `"sapmate"`.
  2. Creates user records with missing `orgId`, leading to broken/orphaned user entities.
  3. Uses fragile string comparisons for timestamps:
     ```javascript
     if (ISOstartDate < new Date().toISOString()) {
       return res.status(400).json({ error: "Start date should be greater than today" });
     }
     ```
     This rejects valid same-day leave applications if submitted later in the day.
- **Legacy Status**: ⚠️ Open
- **TypeScript Backend Status**: ⏳ To be implemented in Phase 4 & 5.

---

#### `ISSUE-EMP-007` · Unauthenticated User Role Escalation & ID Type Mismatch
- **Severity**: 🔴 CRITICAL
- **Location**:
  - `alkaa-backend/src/router/v2/child/user.router.js` (Line 23)
  - `alkaa-backend/src/controller/v2/user/User.controller.js` (Lines 1085–1150)
- **Description**:
  1. `PUT /api/v2/user/:userId/role/:prevRole/:roleId` has no role authorization guard.
  2. In `updateUserRole`, `findUserByIdOrEmployeeId` resolves the user, but the controller uses the raw param `userId` instead of `actualUserId` in `prisma.userRole.create`. Passing a string employee ID crashes with a foreign key error.
  3. If unauthenticated, `logRoleChange(req.user.id)` crashes with `TypeError: Cannot read properties of undefined (reading 'id')`.
  4. Several other user-management routes are also unauthenticated — see `ISSUE-EMP-010`.
- **Impact**:
  Privilege escalation and 500 runtime crashes.
- **Legacy Status**: ⚠️ Open
- **TypeScript Backend Status**: ⏳ To be implemented in Phase 3.

---

#### `ISSUE-EMP-008` · Broken User Creation (Passwordless and Roleless Users)
- **Severity**: 🟠 HIGH
- **Location**:
  - `alkaa-backend/src/controller/v2/user/User.controller.js` (Lines 140–220)
- **Description**:
  `createUser` inserts records directly into `prisma.user` without setting `hashedPassword`, without issuing a verification token, and without creating records in `UserRole`.
- **Impact**:
  Users created via this endpoint cannot log in and have no functional permissions.
- **Legacy Status**: ⚠️ Open
- **TypeScript Backend Status**: ⏳ To be implemented in Phase 4 with full atomic registration and credential generation.

---

#### `ISSUE-EMP-009` · Runtime Crash from Non-Existent `prisma.leaveRecord` Model
- **Severity**: 🟠 HIGH / RUNTIME DEFECT
- **Location**:
  - `alkaa-backend/src/controller/v1/manager/manager.controller.js` (Lines 101, 110, 140)
  - `alkaa-backend/src/controller/v1/employee/employee.controller.js` (Lines 36, 49, 109)
  - `alkaa-backend/prisma/schema.prisma` (only `LeaveBalance` exists; no `leaveRecord` model)
- **Description**:
  Both controllers call `prisma.leaveRecord.findFirst()`, `.create()`, `.update()`, and `.findMany()`, but the Prisma schema defines `LeaveBalance`, not `leaveRecord`. The client property is `undefined`, so these code paths throw `TypeError: Cannot read properties of undefined`.
- **Impact**:
  v1 employee registration, leave balance lookup, and manager leave approval crash at runtime. In `leaveTypeCreate`, the leave type row is created before the crash, leaving partial data (see `ISSUE-EMP-003`).
- **Legacy Status**: ⚠️ Open
- **TypeScript Backend Status**: ⏳ To be implemented in Phase 5 (use the generated `LeaveBalance` model with typed access).

---

#### `ISSUE-EMP-010` · Broader Unauthenticated User CRUD Surface
- **Severity**: 🔴 CRITICAL
- **Location**:
  - `alkaa-backend/src/router/v2/child/user.router.js` (Lines 12–16)
- **Description**:
  In addition to the role-escalation route in `ISSUE-EMP-007`, the following user-management routes have no `validateToken` middleware:
  - `GET /api/v2/user/:id` (`getUserById`)
  - `POST /api/v2/user/` (`createUser`)
  - `PUT`/`PATCH /api/v2/user/:id` (`updateUser`)
  - `DELETE /api/v2/user/` (`hardDeleteUser`)
- **Impact**:
  Anonymous attackers can read user profiles, create passwordless users, modify any user record, or hard-delete users without authentication.
- **Legacy Status**: ⚠️ Open (Vulnerable)
- **TypeScript Backend Status**: ⏳ To be implemented in Phase 3 with authenticated routing and RBAC guards.

---

### Category 4: Onboarding Engine Defects & Architectural Gaps

#### `ISSUE-ONB-001` · Lack of Document Verification Lifecycle
- **Severity**: 🟠 HIGH
- **Location**:
  - `alkaa-backend/src/controller/v2/onboarding/onboarding.controller.js`
- **Description**:
  Candidate submissions (identity cards, education proofs, resumes, previous salary slips) are stored as unstructured JSON in `candidate.formData`. There is no verification state machine per document (e.g. `PENDING`, `VERIFIED`, `REJECTED_WITH_FEEDBACK`). If a document is blurry or invalid, admins cannot request a re-upload of a specific document without rejecting the whole candidate.
- **Legacy Status**: ⚠️ Open (Architectural limitation)
- **TypeScript Backend Status**: ⏳ To be implemented in Phase 4 (Structured document verification workflow with rejection feedback per asset).

---

#### `ISSUE-ONB-002` · Insecure Token & ID Generation via `Math.random()`
- **Severity**: 🟠 HIGH
- **Location**:
  - `alkaa-backend/src/controller/v2/onboarding/onboarding.controller.js` (Lines 1420–1440, 1526)
- **Description**:
  1. `completeOnboarding` generates employee IDs and verification tokens using `Math.random()`:
     ```javascript
     const verificationToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
     ```
  2. `Math.random()` is cryptographically insecure and predictable, creating collision risks and vulnerability to brute force.
- **Legacy Status**: ⚠️ Open
- **TypeScript Backend Status**: 🟡 Partially mitigated (TS auth uses `crypto.randomInt`/`crypto.randomUUID`; the onboarding flow is not yet ported, so this legacy code path remains).

---

#### `ISSUE-ONB-003` · Rigid, Uncustomizable Onboarding Workflow
- **Severity**: 🟡 MEDIUM / ARCHITECTURAL DEFECT
- **Location**:
  - `alkaa-backend/src/controller/v2/onboarding/`
  - `Alkaa-frontend/src/components/onboarding/`
- **Description**:
  The system hardcodes a single rigid onboarding form for every role and department. There is no support for:
  - Department/role-specific onboarding checklists (e.g., Software Engineers needing GitHub/AWS access vs. Sales needing CRM).
  - Multi-stage onboarding approval pipelines (HR Review ➔ Manager Review ➔ IT Provisioning).
  - Automated welcome packet & policy acknowledgement (handbook sign-off).
- **Legacy Status**: ⚠️ Open
- **TypeScript Backend Status**: ⏳ Planned for Phase 4.

---

### Category 5: Employee Management & Dashboard Architecture Gaps

#### `ISSUE-DSH-001` · Monolithic Static Dashboard (No Role Adaptation)
- **Severity**: 🟡 MEDIUM / UX DEFECT
- **Location**:
  - `Alkaa-frontend/src/pages/private/Home.tsx`
- **Description**:
  The dashboard renders the identical static view for SuperAdmins, OrgAdmins, Managers, and Employees alike:
  - Admins do not see organization KPIs (payroll run status, headcount growth, attrition, department cost breakdown).
  - Managers do not see team shift statuses, pending team leave requests, or performance milestones.
  - Employees do not see personal time trackers, available leave balance wallets, or upcoming team holidays.
- **Legacy Status**: ⚠️ Open
- **TypeScript Backend Status**: ⏳ To be implemented with dedicated `/api/v1/dashboard/metrics` (role-scoped responses).

---

#### `ISSUE-DSH-002` · In-Memory Employee Fetching (No Server Pagination/Sorting)
- **Severity**: 🟡 MEDIUM / PERFORMANCE DEFECT
- **Location**:
  - `alkaa-backend/src/controller/v2/organization/Employee/employee.queries.js`
  - `Alkaa-frontend/src/pages/private/system/EmployeeManagementSystem/EmployeeManagement.tsx`
- **Description**:
  `listOfEmployees` fetches all employees, departments, bank details, and roles in a single unpaginated query. The frontend then does in-memory filtering. For organizations with 100+ employees, this causes extreme payload bloat, slow page loads, and high memory usage.
- **Legacy Status**: ⚠️ Open
- **TypeScript Backend Status**: ⏳ Phase 4 will implement server-side pagination (`page`, `limit`), dynamic sorting (`sortBy`, `sortOrder`), and multi-column filtering.

---

#### `ISSUE-DSH-003` · Shallow Employee Profile Depth
- **Severity**: 🟡 MEDIUM / FUNCTIONALITY GAP
- **Location**:
  - `Alkaa-frontend/src/pages/private/system/EmployeeManagementSystem/EmployeeManagement.tsx`
- **Description**:
  Employee management dialog only provides 3 basic tabs (Profile, Department, Role). Enterprise essentials are missing:
  - **Full Compensation Breakdown**: CTC, Basic, HRA, Allowances, PF, Tax, Net Pay.
  - **Documents Vault**: ID Proofs, Offer Letters, Experience Certificates with preview.
  - **Statutory & Bank Records**: PAN, Aadhaar, Bank Details, PF UAN.
  - **Lifecycle Audit Timeline**: Date of joining, department changes, role promotions, salary revisions.
  - **Assigned Company Assets**: Hardware (laptops, monitors), software licenses.
- **Legacy Status**: ⚠️ Open
- **TypeScript Backend Status**: ⏳ To be implemented in Phase 4.

---

### Category 6: Session Hydration, Permissions & Routing Desynchronization

#### `ISSUE-AUTH-005` · Permission Hydration Drop in Legacy `validatetoken`
- **Severity**: 🔴 CRITICAL
- **Location**:
  - `alkaa-backend/src/controller/v1/general/general.controller.js` (Lines 751–760)
  - `Alkaa-frontend/src/providers/AuthContext.tsx` (Lines 175–179)
- **Description**:
  The legacy `validatetoken` endpoint queries user roles with:
  ```javascript
  roles: {
    include: {
      role: {
        select: { id: true, name: true }
      }
    }
  }
  ```
  It completely omits `role.permissions`. Consequently, `response.data.user.permissions` is `undefined`. When the frontend executes `setPermissionList(toPermissionList(response.data.user.permissions))`, `permissionListAtom` is reset to an empty array (`[]`).
- **Impact**:
  1. **Sidebar Collapses**: The left navigation bar hides all modules (Employees, Onboarding, Leave, Attendance, Department, Roles), showing only "Dashboard" and "Logout".
  2. **False Unauthorized Access**: Every permission-guarded route (e.g. `/p/organization`, `/p/employee`, `/p/onboarding`) renders the *"Unauthorized Access - Missing Permissions"* screen even for valid `Org_Admin` users.
- **Legacy Status**: ⚠️ Open (Broken permission hydration)
- **TypeScript Backend Status**: ✅ Resolved (`AuthService.getUserProfile` in `alkaa-backend-ts` traverses all attached roles, dedupes permission keys, and returns a comprehensive `permissions: string[]` array).

---

#### `ISSUE-AUTH-006` · Dual-Domain Frontend API Split & JWT Cookie Desynchronization
- **Severity**: 🔴 CRITICAL
- **Location**:
  - `Alkaa-frontend/src/constants/Domain.ts` (Lines 1–14)
  - `Alkaa-frontend/src/services/api/v2/APIdict.ts` (Lines 1–65)
  - `Alkaa-frontend/.env.local`
- **Description**:
  The frontend configuration points authentication routes (`AuthContext.tsx`) to `VITE_BACKEND_DOMAIN` (`http://localhost:5001`), while business endpoints in `APIDictionary` point to `legacyBackendDomain` (`http://localhost:3000`).
- **Impact**:
  When a user logs in via `http://localhost:5001`, the JWT tokens and session cookies are signed with the TS backend's keys. When subsequent dashboard or module queries hit `http://localhost:3000`, the legacy backend rejects the tokens as invalid or unauthenticated, causing intermittent 401s, 404s, or total loss of session state.
- **Legacy Status**: ⚠️ Open (Split between ports 3000 and 5001)
- **TypeScript Backend Status**: ✅ Resolved (Auth, Organization, Department, Employee, and Onboarding modules are fully consolidated in `alkaa-backend-ts` on port 5001. `Alkaa-frontend/src/services/api/v2/APIdict.ts` was updated to route all these endpoints to `backendDomain` with backward-compatible `/api/v1` and `/api/v2` routes).

---

#### `ISSUE-AUTH-007` · Single-Role Assumption Drops Secondary Permissions (`roles[0]` Pattern)
- **Severity**: 🟠 HIGH
- **Location**:
  - `Alkaa-frontend/src/pages/private/system/EmployeeManagementSystem/EmployeeManagement.tsx`
  - Legacy `App.tsx` / `AuthContext.tsx`
- **Description**:
  Multiple frontend views access permissions using `data?.user?.roles[0]?.role?.permissions`, assuming a user only ever has one role. When an employee is assigned multiple roles (e.g. `Employee1` + `Org_Admin`), all permissions belonging to the second role are dropped if `Employee1` is listed first.
- **Impact**:
  Org Admins who also have an Employee role lose access to administrative screens if their primary array entry is `Employee1`.
- **Legacy Status**: ⚠️ Open
- **TypeScript Backend Status**: ✅ Resolved (`getUserProfile` aggregates and unions permissions across *all* assigned roles into a single flattened array).

---

#### `ISSUE-SA-005` · SuperAdmin Direct Navigation Downgrade & Unauthorized Screen
- **Severity**: 🟠 HIGH
- **Location**:
  - `Alkaa-frontend/src/App.tsx` (Lines 86, 103, 176–180)
- **Description**:
  When a user navigates directly to `http://localhost:5174/p/organization`:
  1. If `isSuperAdmin` evaluates to `false` (or before token validation completes), `ProtectedRoute` renders `ClientRoute` instead of `SuperAdminRoute`.
  2. In `ClientRoute`, `/organization/*` is mapped to `ClientOrganizationModule` wrapped with `PermissionRouteBasedOnKey`.
  3. Because SuperAdmins do not belong to a tenant organization and do not have tenant permission rows, `hasPermission` evaluates to `false`, displaying the *"Unauthorized Access - Missing Permissions: view_organization_basic_details..."* error screen instead of redirecting to the SuperAdmin organization list.
- **Legacy Status**: ⚠️ Open
- **TypeScript Backend Status**: ✅ Resolved (`superAdminAuth.ts` and `organization.router.ts` in TS backend strictly differentiate SuperAdmin organization management from tenant organization profile routes).

---

## 🏛️ Strategic Upgrade Blueprint: Dashboard, Employee Management & Onboarding

### 1. Frontend Repository Strategy: Keep `Alkaa-frontend` (Single Codebase)
- **Decision**: Do **NOT** create a second frontend repository.
- **Rationale**:
  - Unlike the legacy backend (which was un-typed JavaScript with severe security flaws and an outdated database setup), `Alkaa-frontend` is **already built on a modern, robust stack**: React 18, TypeScript, Vite, Tailwind CSS, Radix UI / Shadcn UI primitives, TanStack Query v5, Jotai, and Lucide React.
  - Recreating the frontend from scratch would mean rebuilding 30+ UI primitives, routing maps, auth contexts, Ola Maps SDK integration, PDF generators, and 80+ existing working screens (Attendance, Leaves, Holidays, Roles, Billing).
- **Execution Strategy**:
  1. **Git Isolation**: Develop enhancements on a dedicated branch (`feature/advanced-hrms-dashboard`) so `main` remains 100% production-ready.
  2. **Non-Destructive Side-by-Side Upgrades**: Build the advanced views as modern modular components without breaking legacy paths.
  3. **Backend Switching**: Seamlessly toggle between legacy (`http://localhost:3000`) and TypeScript backend (`http://localhost:5001`) via `VITE_BACKEND_DOMAIN` in `.env.local`.

---

### 2. Modern Role-Adaptive Dashboard Blueprint
The current `Home.tsx` is monolithic and static. The upgraded architecture splits into **three role-tailored viewports**:

#### A. Executive & Organization Admin Viewport
- **Real-Time KPI Cards**:
  - Headcount metrics (Active, In Probation, On Notice, Total).
  - Monthly payroll burn & salary run status.
  - Onboarding pipeline throughput (Candidates in review vs. provisioned).
  - Today's organization attendance rate (% present, absent, on leave).
- **Interactive Visual Analytics**:
  - Department headcount & expenditure distribution (Donut chart).
  - 30-day attendance trends and leave utilization patterns (Area/Line chart).
- **Unified Action Center**:
  - Pending onboarding submissions awaiting document verification.
  - Pending leave escalations and attendance regularization requests.
  - Upcoming employee work anniversaries and contract renewals.

#### B. Department Manager Viewport
- **Team Presence Matrix**: Live real-time dashboard of who is in the office, remote, or on leave today.
- **1-Click Approvals**: Inline approval/rejection drawer for team leave requests and attendance corrections.
- **Team Shift & Capacity Tracker**: Visual weekly calendar showing shift coverage across direct reports.

#### C. Employee Self-Service Viewport
- **Live Shift & Punch Clock**:
  - Real-time elapsed time counter with start/stop shift buttons.
  - Weekly tracked hours progress bar against target work hours.
- **Leave Balance Wallet**: Visual cards displaying remaining balances for Casual Leave, Sick Leave, and Earned Leave with an instant "Apply Leave" modal.
- **Payslip Quick-Access**: One-click download of the latest processed payslip PDF.
- **Team Out Today**: Collapsible widget showing teammates on approved leave to avoid scheduling conflicts.

---

### 3. Enterprise Employee Management Hub Blueprint
Transforms `EmployeeManagement.tsx` from an in-memory filtered list into an enterprise-grade workforce directory:

#### A. High-Performance DataGrid
- **Server-Side Architecture**:
  - Fast paginated endpoint: `GET /api/v1/employees?page=1&limit=20&sortBy=hiredDate&order=desc`.
  - Multi-faceted filters: Department, Role, Employment Status (`Active`, `Probation`, `Notice Period`, `Terminated`), and Manager.
- **Batch Operations**: Bulk department assignment, status updates, and 1-click export to Excel / CSV.

#### B. Comprehensive 7-Tab Employee Profile Drawer
1. **Overview & Org Hierarchy**: Personal details, emergency contacts, job title, reporting manager, and direct subordinates.
2. **Compensation & Payroll Structure**: Structured CTC breakdown (Basic, HRA, Special Allowances, PF deduction, Professional Tax, Net take-home pay).
3. **Bank & Statutory Details**: Bank account, IFSC, PAN number, Aadhaar number, and PF UAN with verification audit tags.
4. **Document Vault**: Uploaded PDFs/images (Aadhaar, PAN, offer letters, degree certificates) with inline thumbnail preview, verification status badges, and secure download.
5. **Leave & Attendance Ledger**: Real-time balance ledger, historical attendance records, and overtime tracking.
6. **Company Assets**: Assigned hardware (laptops, monitors, serial numbers) and software license allocations.
7. **Career Milestones & Timeline**: Visual activity trail of joining date, promotions, department transfers, and compensation revisions.

---

### 4. Interactive Onboarding Pipeline Blueprint
Replaces the flat table in `OnboardingManagement.tsx` with a multi-stage workflow:

#### A. Visual Kanban Pipeline
- **Stages**:
  `1. Invited` ➔ `2. Draft In Progress` ➔ `3. Form Submitted` ➔ `4. Document Verification` ➔ `5. Approved` ➔ `6. Employee Provisioned`.
- Drag-and-drop or 1-click stage advancement with automated candidate notification emails at each milestone.

#### B. Granular Asset-Level Document Review
- Admins can inspect each submitted document (Govt ID, educational degree, previous experience letter) individually.
- **Actions per Document**:
  - `[ ✅ Verify Document ]`
  - `[ ⚠️ Request Re-upload ]` with an inline reason/comment (e.g., *"Aadhaar card scan is blurry; please upload a clear colored copy"*).
  - Sends an instant email notification to the candidate with a secure link to re-upload only the flagged document without resetting the entire form.

#### C. Role-Based Onboarding Checklists & Automated Provisioning
- **Customizable Checklists**: Assign department-specific tasks (e.g., Software Engineering: GitHub + AWS invite; Sales: CRM setup).
- **1-Click Atomic Employee Creation**:
  - Generates the `User` record with secure cryptographically random credentials.
  - Automatically provisions the business email address.
  - Connects designated department, reporting manager, and RBAC roles.
  - Automatically initializes leave balance ledger according to company policy.
  - Dispatches an automated onboarding welcome package email with login credentials.

---

*This document is continuously updated as backend modules and frontend interfaces are designed, audited, and deployed.*

